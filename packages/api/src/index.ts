import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { env } from './env.js';
import { WsLogHub } from './wsLogHub.js';
import { createServer as createViteServer } from 'vite';
import { setLogHub } from './logger';
import { cleanupOrphanedRedisKeys } from './cleanup';
import { PROJECT_ROOT } from './settings';
import { createApiRouter } from './routes';


async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  const isDev = process.env.NODE_ENV !== 'production';
  const webRoot = path.resolve(PROJECT_ROOT, 'apps/web-ui');

  const server = app.listen(env.API_PORT, () => {
    console.log(`[api] 服务启动于端口 :${env.API_PORT}`);
    console.log(`[api] 访问 http://localhost:${env.API_PORT}`);
  });

  const wss = new WebSocketServer({ server, path: '/ws/logs' });
  setLogHub(new WsLogHub(wss));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api', createApiRouter());

  // vite 集成，放在 api 路由之后
  if (isDev) {
    console.log('[api] 开发模式，启动 Vite 中间件');
    console.log('[api] Web 根目录:', webRoot);

    try {
      const vite = await createViteServer({
        root: webRoot,
        server: { middlewareMode: true },
        appType: 'spa',
        configFile: path.join(webRoot, 'vite.config.ts')
      });
      app.use(vite.middlewares);
      console.log('[api] Vite 中间件已启动');
    } catch (e) {
      console.error('[api] Vite 启动失败：', e);
    }
  } else {
    const distPath = path.join(webRoot, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  // 每 30 秒清理一次孤儿 Redis 数据
  setInterval(cleanupOrphanedRedisKeys, 30000);
  // 启动时也清理一次
  setTimeout(cleanupOrphanedRedisKeys, 5000);
}

main().catch(console.error);