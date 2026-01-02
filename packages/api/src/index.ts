import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/index.js';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { z } from 'zod';
import { env } from './env.js';
import { WsLogHub } from './wsLogHub.js';
import { type AppSettings, DEFAULT_SETTINGS, getNextAlignedTime } from '@pkg/shared';
import { createServer as createViteServer } from 'vite';
import { Notifier } from '@pkg/worker/src/notifier.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});
const queue = new Queue('monitor', { connection: redis });

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../../');

let logHub: WsLogHub;

export function log(level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) {
  if (logHub) {
    logHub.broadcast({ ts: new Date().toISOString(), level, msg, meta });
  }
  console.log(`[${level}] ${msg}`, meta ?? '');
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const config = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
    if (!config) {
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(config.settings) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  await prisma.appConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', settings: JSON.stringify(merged) },
    update: { settings: JSON.stringify(merged) }
  });
  return merged;
}

function resolveDownloadDir(downloadDir: string): string {
  if (path.isAbsolute(downloadDir)) {
    return downloadDir;
  }
  return path.resolve(PROJECT_ROOT, downloadDir);
}

async function cleanupOrphanedRedisKeys() {
  try {
    const targets = await prisma.target.findMany({ select: { id: true } });
    const targetIds = new Set(targets.map(t => t.id));

    const schedulers = await queue.getJobSchedulers();
    const validSchedulerKeys = new Set<string>();
    let deletedSchedulers = 0;

    for (const scheduler of schedulers) {
      const dataTargetId = (scheduler as any).template?.data?.targetId;
      if (dataTargetId && !targetIds.has(dataTargetId)) {
        try {
          await queue.removeJobScheduler(scheduler.key);
          deletedSchedulers++;
        } catch {
        }
      } else {
        validSchedulerKeys.add(scheduler.key);
      }
    }

    const repeatKeys = await redis.keys('bull:monitor:repeat:*');
    let deletedRepeatKeys = 0;

    for (const key of repeatKeys) {
      const targetMatch = key.match(/bull:monitor:repeat:target:([a-z0-9]+):/i);
      if (targetMatch) {
        const foundTargetId = targetMatch[1];
        if (!targetIds.has(foundTargetId)) {
          try {
            await redis.del(key);
            deletedRepeatKeys++;
          } catch {
          }
        }
      }
    }

    const manualKeys = await redis.keys('bull:monitor:manual:*');
    let deletedManualKeys = 0;

    for (const key of manualKeys) {
      const match = key.match(/bull:monitor:manual:([a-z0-9]+):/i);
      if (match) {
        const keyTargetId = match[1];
        if (!targetIds.has(keyTargetId)) {
          try {
            await redis.del(key);
            deletedManualKeys++;
          } catch {
          }
        }
      }
    }

    if (deletedSchedulers > 0 || deletedRepeatKeys > 0 || deletedManualKeys > 0) {
      console.log(`[cleanup] 清理完成: ${deletedSchedulers} scheduler, ${deletedRepeatKeys} repeat, ${deletedManualKeys} manual`);
    }
  } catch (e) {
    console.error('[cleanup] 清理失败:', e);
  }
}

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  const isDev = process.env.NODE_ENV !== 'production';
  const webRoot = path.resolve(PROJECT_ROOT, 'apps/web-ui');

  const server = app.listen(env.API_PORT, () => {
    console.log(`[api] 服务启动于端口 :${env.API_PORT}`);
    console.log(`[api] 访问 http://localhost:${env.API_PORT}`);
  });

  const wss = new WebSocketServer({ server, path: '/ws/logs' });
  logHub = new WsLogHub(wss);

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/log', (req, res) => {
    const { level, msg, meta } = req.body;
    if (level && msg) {
      log(level, msg, meta);
    }
    res.json({ ok: true });
  });

  app.get('/api/settings', async (_req, res) => {
    try {
      const settings = await getSettings();
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const settings = await saveSettings(req.body);
      log('info', '设置已更新');
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/settings/reset', async (_req, res) => {
    try {
      await prisma.appConfig.deleteMany({ where: { id: 'singleton' } });
      log('info', '设置已重置为默认值');
      res.json(DEFAULT_SETTINGS);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const CreateTargetSchema = z.object({
    name: z.string().min(1),
    sourceType: z.enum(['http_json', 'douyin']),
    sourceConfig: z.string().default('{}')
  });

  app.get('/api/targets', async (_req, res) => {
    try {
      const targets = await prisma.target.findMany({ orderBy: { createdAt: 'desc' } });
      res.json(targets);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/targets', async (req, res) => {
    try {
      const data = CreateTargetSchema.parse(req.body);
      const t = await prisma.target.create({ data });
      log('info', '目标已创建', { targetId: t.id, name: t.name, sourceType: t.sourceType });

      const settings = await getSettings();
      const intervalMs = settings.workerPollIntervalSeconds * 1000;
      const nextTime = getNextAlignedTime(intervalMs);

      await queue.upsertJobScheduler(
        `target:${t.id}`,
        {
          every: intervalMs,
          startDate: nextTime
        },
        {
          name: `target:${t.id}`,
          data: { targetId: t.id, reason: 'scheduled' }
        }
      );

      log('info', '已添加到监控队列', { targetId: t.id });
      res.json(t);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/targets/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const data = CreateTargetSchema.partial().parse(req.body);
      const t = await prisma.target.update({ where: { id }, data });
      log('info', '目标已更新', { targetId: t.id });
      res.json(t);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/targets/:id', async (req, res) => {
    try {
      const id = req.params.id;
      console.log(`\n删除目标: ${id}`);

      try {
        const schedulers = await queue.getJobSchedulers();
        for (const scheduler of schedulers) {
          const nameMatch = scheduler.name === `target:${id}`;
          const dataMatch = (scheduler as any).template?.data?.targetId === id;
          if (nameMatch || dataMatch) {
            console.log(`[api] 删除 scheduler: ${scheduler.key}`);
            await queue.removeJobScheduler(scheduler.key);
          }
        }
      } catch (e) {
        console.error('[api] 删除 job scheduler 失败:', e);
      }

      await prisma.target.delete({ where: { id } });
      console.log(`[api] 数据库目标已删除: ${id}`);
      console.log(`删除完成\n`);

      log('info', '目标已删除', { targetId: id });
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[api] 删除目标失败:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/videos', async (req, res) => {
    try {
      const { targetId, limit = '200' } = req.query;
      const where = targetId ? { targetId: String(targetId) } : {};
      const videos = await prisma.video.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: parseInt(String(limit)),
        include: { target: { select: { name: true } } }
      });
      res.json(videos);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/targets/:id/videos', async (req, res) => {
    try {
      const id = req.params.id;
      const videos = await prisma.video.findMany({
        where: { targetId: id },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 200
      });
      res.json(videos);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/job-runs', async (_req, res) => {
    try {
      const runs = await prisma.jobRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { target: { select: { name: true } } }
      });
      res.json(runs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/targets/:id/trigger', async (req, res) => {
    try {
      const id = req.params.id;
      const target = await prisma.target.findUnique({ where: { id } });
      if (!target) {
        return res.status(404).json({ error: '目标不存在' });
      }

      const run = await prisma.jobRun.create({ data: { targetId: id, status: 'queued' } });

      await queue.add(
        'monitorTarget',
        { targetId: id, jobRunId: run.id, reason: 'manual' },
        { jobId: `manual:${id}:${Date.now()}` }
      );

      log('info', '任务已触发', { targetId: id, jobRunId: run.id });
      res.json(run);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/downloads', async (_req, res) => {
    try {
      const settings = await getSettings();
      const downloadDir = resolveDownloadDir(settings.downloadDir);

      if (!fs.existsSync(downloadDir)) {
        await fs.promises.mkdir(downloadDir, { recursive: true });
        return res.json({ files: [], totalSize: 0, downloadDir });
      }

      const files: Array<{
        name: string;
        path: string;
        size: number;
        createdAt: string;
        targetId?: string;
      }> = [];

      const entries = await fs.promises.readdir(downloadDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const authorName = entry.name;
          const authorPath = path.join(downloadDir, authorName);

          try {
            const videoFiles = await fs.promises.readdir(authorPath);
            for (const file of videoFiles) {
              if (file.endsWith('.mp4')) {
                const filePath = path.join(authorPath, file);
                try {
                  const fileStat = await fs.promises.stat(filePath);
                  files.push({
                    name: file,
                    path: `${authorName}/${file}`,
                    size: fileStat.size,
                    createdAt: fileStat.birthtime.toISOString(),
                    targetId: authorName
                  });
                } catch {
                }
              }
            }
          } catch {
          }
        }
      }

      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      res.json({ files, totalSize, downloadDir });
    } catch (e: any) {
      console.error('[api] /api/downloads error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/download-file', async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: '缺少 path 参数' });
      }

      const settings = await getSettings();
      const downloadDir = resolveDownloadDir(settings.downloadDir);
      const fullPath = path.join(downloadDir, filePath);

      const normalizedPath = path.normalize(fullPath);
      if (!normalizedPath.startsWith(path.normalize(downloadDir))) {
        return res.status(403).json({ error: '非法路径' });
      }

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: '文件不存在' });
      }

      const fileName = path.basename(fullPath);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.setHeader('Content-Type', 'video/mp4');

      const stream = fs.createReadStream(fullPath);
      stream.pipe(res);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/repeatable-jobs', async (_req, res) => {
    try {
      const jobs = await queue.getJobSchedulers();
      res.json(jobs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/clear-all-jobs', async (_req, res) => {
    try {
      const schedulers = await queue.getJobSchedulers();
      let cleaned = 0;
      for (const scheduler of schedulers) {
        try {
          await queue.removeJobScheduler(scheduler.key);
          cleaned++;
        } catch {
        }
      }
      await queue.drain();
      log('info', '已清理所有定时任务', { cleaned });
      res.json({ cleaned, total: schedulers.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/obliterate-queue', async (_req, res) => {
    try {
      await queue.obliterate({ force: true });
      log('info', '队列已彻底清空');
      res.json({ ok: true, message: '队列已彻底清空' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/cleanup-orphans', async (_req, res) => {
    try {
      await cleanupOrphanedRedisKeys();
      res.json({ ok: true, message: '清理完成' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/cleanup-jobs', async (_req, res) => {
    try {
      const targets = await prisma.target.findMany();
      const targetIds = new Set(targets.map(t => t.id));
      const schedulers = await queue.getJobSchedulers();
      let cleaned = 0;

      for (const scheduler of schedulers) {
        const dataTargetId = (scheduler as any).template?.data?.targetId;
        if (dataTargetId && !targetIds.has(dataTargetId)) {
          console.log(`[api] 清理孤儿 scheduler: key=${scheduler.key}, targetId=${dataTargetId}`);
          await queue.removeJobScheduler(scheduler.key);
          cleaned++;
        }
      }

      log('info', '清理孤儿任务完成', { cleaned });
      res.json({ cleaned, total: schedulers.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/proxies', async (_req, res) => {
    try {
      const proxies = await prisma.proxyPool.findMany({
        orderBy: { successCount: 'desc' }
      });
      res.json(proxies);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/proxies/:id', async (req, res) => {
    try {
      await prisma.proxyPool.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/test-notify', async (_req, res) => {
    try {
      const settings = await getSettings();

      if (!settings.notifyEnabled || settings.notifyType === 'none') {
        return res.status(400).json({ error: '通知未启用' });
      }

      const resp = await fetch('http://localhost:2012/api/send-test-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || '发送失败');
      }

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/send-test-notify', async (req, res) => {
    try {
      const settings = req.body as AppSettings;

      const notifier = new Notifier(settings);

      await notifier.send({
        title: '测试通知',
        content: `这是一条测试消息\n时间：${new Date().toLocaleString('zh-CN')}\n如果你收到此消息，说明通知配置正确`,
        type: 'success'
      });

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // vite 集成，放在 api 路由之后
  if (isDev) {
    console.log('[api] 开发模式，启动 Vite 中间件');
    console.log('[api] Web 根目录:', webRoot);

    try {
      const vite = await createViteServer({
        root: webRoot,
        server: { middlewareMode: true },
        appType: 'spa',
        configFile: path.join(webRoot, 'vite.config.ts')
      });
      app.use(vite.middlewares);
      console.log('[api] Vite 中间件已启动');
    } catch (e) {
      console.error('[api] Vite 启动失败：', e);
    }
  } else {
    const distPath = path.join(webRoot, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  // 每 30 秒清理一次孤儿 Redis 数据
  setInterval(cleanupOrphanedRedisKeys, 30000);
  // 启动时也清理一次
  setTimeout(cleanupOrphanedRedisKeys, 5000);
}

main().catch(console.error);

export { prisma };