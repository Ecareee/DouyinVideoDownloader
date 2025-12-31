import { Worker } from 'bullmq';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@pkg/api/prisma/generated';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './env.js';
import { connection, monitorQueue } from './queue.js';
import { makeAdapter } from './adapters';
import { downloadVideo, getJitteredDelay } from './downloader.js';
import { proxyManager } from './proxyManager.js';
import { createNotifyPayload, Notifier } from './notifier.js';
import type { AppSettings } from '@pkg/shared';
import { DEFAULT_SETTINGS } from '@pkg/shared';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type JobData = { targetId: string; jobRunId?: string; reason?: string };

const API_URL = `http://localhost:${process.env.API_PORT || 2012}`;
const lastRunTime = new Map<string, number>();

// 发送日志到 api，通过 websocket 广播
async function sendLogToApi(level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) {
  try {
    await fetch(`${API_URL}/api/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, msg, meta })
    });
  } catch {
  }
}

function log(msg: string, meta?: Record<string, unknown>) {
  console.log(`[worker] ${msg}`, meta ?? '');
  sendLogToApi('info', `[worker] ${msg}`, meta);
}

async function getSettings(): Promise<AppSettings> {
  try {
    const config = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
    if (!config) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(config.settings) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function cleanupStuckJobs() {
  try {
    const stuckJobs = await prisma.jobRun.updateMany({
      where: { status: 'running' },
      data: { status: 'failed', finishedAt: new Date(), error: '服务重启，任务被中断' }
    });
    if (stuckJobs.count > 0) {
      log(`清理了 ${stuckJobs.count} 个卡住的任务`);
    }
  } catch (e) {
    console.error('[worker] 清理卡住任务失败：', e);
  }
}

async function cleanupOldJobRuns() {
  try {
    const count = await prisma.jobRun.count();
    if (count > 1000) {
      const toDelete = count - 1000;
      const oldRuns = await prisma.jobRun.findMany({
        orderBy: { createdAt: 'asc' },
        take: toDelete,
        select: { id: true }
      });
      await prisma.jobRun.deleteMany({
        where: { id: { in: oldRuns.map(r => r.id) } }
      });
      log(`清理了 ${toDelete} 条旧任务记录`);
    }
  } catch (e) {
    console.error('[worker] 清理旧记录失败：', e);
  }
}

async function ensureRepeatableJobs() {
  const targets = await prisma.target.findMany();
  const settings = await getSettings();
  const targetIds = new Set(targets.map(t => t.id));

  try {
    const repeatableJobs = await monitorQueue.getJobSchedulers();
    for (const job of repeatableJobs) {
      let hasValidTarget = false;
      for (const targetId of targetIds) {
        if (job.name?.includes(targetId)) {
          hasValidTarget = true;
          break;
        }
      }

      if (!hasValidTarget) {
        console.log(`[worker] 清理已删除目标的定时任务: ${job.id}`);
        if (job.key) {
          await monitorQueue.removeJobScheduler(job.key);
        }
      }
    }
  } catch (e) {
    console.warn('[worker] 清理旧 repeatable jobs 失败:', e);
  }

  const baseIntervalMs = settings.workerPollIntervalSeconds * 1000;

  const now = new Date();
  const nextMinute = new Date(now);
  nextMinute.setSeconds(0, 0);
  nextMinute.setMinutes(nextMinute.getMinutes() + 1);

  for (const t of targets) {
    const jitteredInterval = getJitteredDelay(baseIntervalMs, settings.checkIntervalJitter);

    await monitorQueue.upsertJobScheduler(
      `target:${t.id}`,
      {
        every: Math.round(jitteredInterval),
        startDate: nextMinute // 对齐到整分钟
      },
      {
        name: `target:${t.id}`,
        data: { targetId: t.id, reason: 'scheduled' }
      }
    );
  }

  log('定时任务已设置', {
    targets: targets.length,
    baseIntervalSeconds: settings.workerPollIntervalSeconds,
    jitterPercent: settings.checkIntervalJitter,
    nextRun: nextMinute.toLocaleTimeString('zh-CN')
  });
}

async function writeSnapshot() {
  const dir = env.ARTIFACTS_DIR;
  await fs.promises.mkdir(dir, { recursive: true });

  const targets = await prisma.target.findMany();
  const videos = await prisma.video.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });

  const payload = {
    generatedAt: new Date().toISOString(),
    targets,
    videos
  };

  await fs.promises.writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

const worker = new Worker<JobData>(
  'monitor',
  async (job) => {
    if (!job.data || !job.data.targetId) {
      console.log(`[worker] job.data 无效，跳过`, { jobId: job.id, data: job.data });
      return;
    }

    const { targetId, jobRunId } = job.data;

    const target = await prisma.target.findUnique({ where: { id: targetId } });
    if (!target) {
      log('目标不存在，跳过', { targetId });
      return;
    }

    const settings = await getSettings();
    const notifier = new Notifier(settings);

    proxyManager.configure(settings);

    if (settings.proxyAutoFetch) {
      await proxyManager.fetchProxies();
    }

    const lastRun = lastRunTime.get(targetId);
    if (lastRun) {
      const elapsed = Date.now() - lastRun;
      const minDelay = settings.userDelayMin;
      if (elapsed < minDelay) {
        const waitTime = minDelay - elapsed + Math.random() * (settings.userDelayMax - settings.userDelayMin);
        log(`用户间延迟: 等待 ${Math.round(waitTime)}ms`, { targetId });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    let runId: string | undefined;

    try {
      if (jobRunId) {
        const existingRun = await prisma.jobRun.findUnique({ where: { id: jobRunId } });
        if (existingRun) {
          await prisma.jobRun.update({
            where: { id: jobRunId },
            data: { status: 'running', startedAt: new Date() }
          });
          runId = jobRunId;
        }
      }

      if (!runId) {
        const stillExists = await prisma.target.findUnique({ where: { id: targetId } });
        if (!stillExists) {
          log('目标已被删除，跳过创建任务记录', { targetId });
          return;
        }

        const run = await prisma.jobRun.create({
          data: { targetId, status: 'running', startedAt: new Date() }
        });
        runId = run.id;
      }
    } catch (e: any) {
      log('创建任务记录失败，跳过', { targetId, error: e.message });
      return;
    }

    try {
      const adapter = makeAdapter({
        id: target.id,
        name: target.name,
        sourceType: target.sourceType as any,
        sourceConfig: target.sourceConfig,
        createdAt: target.createdAt.toISOString(),
        updatedAt: target.updatedAt.toISOString()
      });

      const items = await adapter.listVideos({
        id: target.id,
        name: target.name,
        sourceType: target.sourceType as any,
        sourceConfig: target.sourceConfig,
        createdAt: target.createdAt.toISOString(),
        updatedAt: target.updatedAt.toISOString()
      });

      lastRunTime.set(targetId, Date.now());

      let inserted = 0;
      let downloaded = 0;

      for (const v of items) {
        if (!await prisma.target.findUnique({ where: { id: targetId } })) return;

        try {
          // 使用 upsert 避免重复插入错误
          const video = await prisma.video.upsert({
            where: {
              targetId_platformId: {
                targetId: target.id,
                platformId: v.platformId
              }
            },
            create: {
              targetId: target.id,
              platformId: v.platformId,
              title: v.title,
              publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
              pageUrl: v.pageUrl,
              coverUrl: v.coverUrl,
              directDownloadUrl: v.directDownloadUrl,
              authorName: v.authorName,
              authorId: v.authorId
            },
            update: {
              title: v.title,
              directDownloadUrl: v.directDownloadUrl
            }
          });

          if (!video.localPath && video.directDownloadUrl) {
            const localPath = await downloadVideo(v, target.id, settings);
            if (localPath) {
              await prisma.video.update({ where: { id: video.id }, data: { localPath } });
              downloaded++;
            }
          }

          const isNew = Date.now() - new Date(video.createdAt).getTime() < 5000;
          if (isNew) inserted++;
        } catch (err: any) {
          console.error(`[worker] 处理视频失败: ${v.platformId}`, err.message);
        }
      }

      try {
        await prisma.jobRun.update({
          where: { id: runId },
          data: { status: 'succeeded', finishedAt: new Date(), error: null }
        });
      } catch {
      }

      log('任务成功完成', { targetId, inserted, downloaded });

      if (downloaded > 0) {
        await notifier.send(createNotifyPayload('success', target.name, downloaded));
      }

      await writeSnapshot();
    } catch (e: any) {
      try {
        await prisma.jobRun.update({
          where: { id: runId },
          data: { status: 'failed', finishedAt: new Date(), error: e?.message ?? String(e) }
        });
      } catch {
      }

      log('任务执行失败', { targetId, error: e?.message ?? String(e) });

      await notifier.send(createNotifyPayload('fail', target.name, 0, e?.message));

      throw e;
    }
  },
  { connection, concurrency: env.WORKER_CONCURRENCY }
);

worker.on('failed', (job, err) => {
  log('任务失败', { jobId: job?.id, name: job?.name, error: err.message });
});

// 启动时的清理
await cleanupStuckJobs();
await cleanupOldJobRuns();
await ensureRepeatableJobs();

// 每小时清理一次旧记录
setInterval(cleanupOldJobRuns, 60 * 60 * 1000);

log('Worker 已启动', {
  concurrency: env.WORKER_CONCURRENCY,
  proxyStats: proxyManager.getStats()
});