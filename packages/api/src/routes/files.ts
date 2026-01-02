import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getSettings, resolveDownloadDir } from '../settings.js';

export const filesRouter = Router();

interface FileInfo {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  targetId?: string;
}

// GET /api/files 获取文件列表
filesRouter.get('/', async (_req, res) => {
  try {
    const settings = await getSettings();
    const downloadDir = resolveDownloadDir(settings.downloadDir);

    if (!fs.existsSync(downloadDir)) {
      await fs.promises.mkdir(downloadDir, { recursive: true });
      return res.json({ files: [], totalSize: 0, downloadDir });
    }

    const files: FileInfo[] = [];
    const entries = await fs.promises.readdir(downloadDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const authorName = entry.name;
        const authorPath = path.join(downloadDir, authorName);

        try {
          const videoFiles = await fs.promises.readdir(authorPath);
          for (const file of videoFiles) {
            if (file.endsWith('.mp4')) {
              const filePath = path.join(authorPath, file);
              try {
                const stat = await fs.promises.stat(filePath);
                files.push({
                  name: file,
                  path: `${authorName}/${file}`,
                  size: stat.size,
                  createdAt: stat.birthtime.toISOString(),
                  targetId: authorName
                });
              } catch {
              }
            }
          }
        } catch {
        }
      }
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    res.json({ files, totalSize, downloadDir });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/files/download 下载文件
filesRouter.get('/download', async (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: '缺少 path 参数' });
    }

    const settings = await getSettings();
    const downloadDir = resolveDownloadDir(settings.downloadDir);
    const fullPath = path.join(downloadDir, filePath);

    const normalizedPath = path.normalize(fullPath);
    if (!normalizedPath.startsWith(path.normalize(downloadDir))) {
      return res.status(403).json({ error: '非法路径' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const fileName = path.basename(fullPath);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Content-Type', 'video/mp4');

    fs.createReadStream(fullPath).pipe(res);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});