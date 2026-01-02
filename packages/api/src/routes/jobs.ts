import { Router } from 'express';
import { prisma } from '../db';

export const jobsRouter = Router();

// GET /api/jobs 获取任务记录
jobsRouter.get('/', async (_req, res) => {
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