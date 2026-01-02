import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../db';
import { queue } from '../redis';
import { getSettings } from '../settings';
import { getNextAlignedTime } from '@pkg/shared';
import { log } from '../logger';

export const targetsRouter = Router();

const TargetSchema = z.object({
  name: z.string().min(1),
  sourceType: z.enum(['http_json', 'douyin']),
  sourceConfig: z.string().default('{}')
});

// GET /api/targets 获取所有目标
targetsRouter.get('/', async (_req, res) => {
  try {
    const targets = await prisma.target.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(targets);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/targets 创建目标
targetsRouter.post('/', async (req, res) => {
  try {
    const data = TargetSchema.parse(req.body);
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

// PUT /api/targets/:id 更新目标
targetsRouter.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const data = TargetSchema.partial().parse(req.body);
    const t = await prisma.target.update({ where: { id }, data });
    log('info', '目标已更新', { targetId: t.id });
    res.json(t);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/targets/:id 删除目标
targetsRouter.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`\n删除目标：${id}`);

    try {
      const schedulers = await queue.getJobSchedulers();
      for (const scheduler of schedulers) {
        const nameMatch = scheduler.name === `target:${id}`;
        const dataMatch = (scheduler as any).template?.data?.targetId === id;
        if (nameMatch || dataMatch) {
          console.log(`[api] 删除 scheduler：${scheduler.key}`);
          await queue.removeJobScheduler(scheduler.key);
        }
      }
    } catch (e) {
      console.error('[api] 删除 job scheduler 失败：', e);
    }

    await prisma.target.delete({ where: { id } });
    console.log(`[api] 数据库目标已删除：${id}`);
    console.log(`删除完成\n`);

    log('info', '目标已删除', { targetId: id });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[api] 删除目标失败：', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/targets/:id/jobs 触发任务
targetsRouter.post('/:id/jobs', async (req, res) => {
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

// GET /api/targets/:id/videos 获取目标的视频
targetsRouter.get('/:id/videos', async (req, res) => {
  try {
    const { id } = req.params;
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