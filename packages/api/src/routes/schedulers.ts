import { Router } from 'express';
import { queue } from '../redis.js';
import { log } from '../logger.js';

export const schedulersRouter = Router();

// GET /api/schedulers 获取定时任务列表
schedulersRouter.get('/', async (_req, res) => {
  try {
    const schedulers = await queue.getJobSchedulers();
    res.json(schedulers);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/schedulers 清空所有定时任务
schedulersRouter.delete('/', async (_req, res) => {
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