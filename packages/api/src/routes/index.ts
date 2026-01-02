import { Router } from 'express';
import { targetsRouter } from './targets.js';
import { videosRouter } from './videos.js';
import { jobsRouter } from './jobs.js';
import { settingsRouter } from './settings.js';
import { proxiesRouter } from './proxies.js';
import { maintenanceRouter } from './maintenance.js';
import { log } from '../logger.js';
import { schedulersRouter } from './schedulers';
import { filesRouter } from './files';
import { notificationsRouter } from './notifications';

export function createApiRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => res.json({ ok: true }));

  router.post('/logs', (req, res) => {
    const { level, msg, meta } = req.body;
    if (level && msg) {
      log(level, msg, meta);
    }
    res.json({ ok: true });
  });

  router.use('/targets', targetsRouter);
  router.use('/videos', videosRouter);
  router.use('/jobs', jobsRouter);
  router.use('/schedulers', schedulersRouter);
  router.use('/files', filesRouter);
  router.use('/settings', settingsRouter);
  router.use('/notifications', notificationsRouter);
  router.use('/proxies', proxiesRouter);
  router.use('/maintenance', maintenanceRouter);

  return router;
}