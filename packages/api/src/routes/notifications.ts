import { Router } from 'express';
import { getSettings } from '../settings.js';
import { Notifier } from '@pkg/worker/src/notifier.js';

export const notificationsRouter = Router();

// POST /api/notifications/test 测试通知
notificationsRouter.post('/test', async (_req, res) => {
  try {
    const settings = await getSettings();

    if (!settings.notifyEnabled || settings.notifyType === 'none') {
      return res.status(400).json({ error: '通知未启用' });
    }

    const notifier = new Notifier(settings);
    await notifier.send({
      title: '测试通知',
      content: `这是一条测试消息\n时间：${new Date().toLocaleString('zh-CN')}\n如果你收到此消息，说明通知配置正确`,
      type: 'success'
    }, true); // throwOnError = true

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});