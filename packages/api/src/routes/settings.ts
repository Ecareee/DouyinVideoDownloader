import { Router } from 'express';
import { DEFAULT_SETTINGS } from '@pkg/shared';
import { prisma } from '../db';
import { log } from '../logger';
import { getSettings, saveSettings } from '../settings';

export const settingsRouter = Router();

// GET /api/settings 获取设置
settingsRouter.get('/', async (_req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/settings 更新设置
settingsRouter.put('/', async (req, res) => {
  try {
    const settings = await saveSettings(req.body);
    log('info', '设置已更新');
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/settings 重置设置
settingsRouter.delete('/', async (_req, res) => {
  try {
    await prisma.appConfig.deleteMany({ where: { id: 'singleton' } });
    log('info', '设置已重置为默认值');
    res.json(DEFAULT_SETTINGS);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});