import { prisma } from '../db';
import { Router } from 'express';

export const videosRouter = Router();

// GET /api/videos 获取视频列表
videosRouter.get('/', async (req, res) => {
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