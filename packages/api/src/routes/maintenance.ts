import { Router } from 'express';
import { cleanupOrphanedRedisKeys } from '../cleanup';

export const maintenanceRouter = Router();

// DELETE /api/maintenance/orphans 清理孤儿数据
maintenanceRouter.delete('/orphans', async (_req, res) => {
  try {
    await cleanupOrphanedRedisKeys();
    res.json({ ok: true, message: '清理完成' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});