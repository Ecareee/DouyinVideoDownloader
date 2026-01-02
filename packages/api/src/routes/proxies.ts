import { Router } from 'express';
import { prisma } from '../db';

export const proxiesRouter = Router();

// GET /api/proxies 获取代理列表
proxiesRouter.get('/', async (_req, res) => {
  try {
    const proxies = await prisma.proxyPool.findMany({
      orderBy: { successCount: 'desc' }
    });
    res.json(proxies);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/proxies/:id 删除代理
proxiesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.proxyPool.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});