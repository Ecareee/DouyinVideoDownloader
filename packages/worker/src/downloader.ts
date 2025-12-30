import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import type { AppSettings, VideoItem } from '@pkg/shared';
import { USER_AGENTS } from '@pkg/shared';
import { proxyManager } from './proxyManager.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../../');

function resolveDownloadDir(downloadDir: string): string {
  if (path.isAbsolute(downloadDir)) {
    return downloadDir;
  }
  return path.resolve(PROJECT_ROOT, downloadDir);
}

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * 根据模板生成文件名
 * 模板变量: {author}, {date}, {time}, {id}, {title}
 */
export function generateFileName(video: VideoItem, template: string): string {
  const publishDate = video.publishedAt ? new Date(video.publishedAt) : new Date();

  const date = publishDate.toISOString().slice(0, 10).replace(/-/g, '');
  const time = publishDate.toTimeString().slice(0, 8).replace(/:/g, '');

  const author = sanitizeFileName(video.authorName || 'unknown');
  const title = sanitizeFileName((video.title || '').slice(0, 50));
  const id = video.platformId;

  let fileName = template
    .replace('{author}', author)
    .replace('{date}', date)
    .replace('{time}', time)
    .replace('{id}', id)
    .replace('{title}', title);

  // 清理连续的下划线
  fileName = fileName.replace(/_+/g, '_').replace(/^_|_$/g, '');

  return `${fileName}.mp4`;
}

// 清理文件名中的非法字符
function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100);
}

// 随机延迟
export async function randomDelay(min: number, max: number): Promise<void> {
  const delay = min + Math.random() * (max - min);
  console.log(`[downloader] 等待 ${Math.round(delay)}ms...`);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// 带抖动的随机延迟
export function getJitteredDelay(baseMs: number, jitterPercent: number): number {
  const jitter = baseMs * (jitterPercent / 100);
  return baseMs + (Math.random() * 2 - 1) * jitter;
}

export async function downloadToFile(
  directUrl: string,
  outDir: string,
  fileName: string,
  settings?: AppSettings
): Promise<string> {
  await fs.promises.mkdir(outDir, { recursive: true });
  const fullPath = path.join(outDir, fileName);

  if (fs.existsSync(fullPath)) {
    console.log(`[downloader] 文件已存在，跳过: ${fileName}`);
    return fullPath;
  }

  const userAgent = settings?.userAgentRotation
    ? getRandomUserAgent()
    : USER_AGENTS[0];

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    Referer: 'https://www.douyin.com/',
    Accept: '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  };

  const agent = proxyManager.getAgent();
  const proxyUrl = proxyManager.getNextProxy();

  try {
    const resp = await axios.get(directUrl, {
      responseType: 'stream',
      timeout: 180_000,
      headers,
      maxRedirects: 5,
      httpAgent: agent,
      httpsAgent: agent
    });

    const ws = fs.createWriteStream(fullPath);

    await new Promise<void>((resolve, reject) => {
      resp.data.pipe(ws);
      ws.on('finish', () => resolve());
      ws.on('error', reject);
    });

    console.log(`[downloader] 下载完成: ${fileName}`);

    if (proxyUrl) {
      proxyManager.markSuccess(proxyUrl);
    }

    return fullPath;
  } catch (e: any) {
    if (proxyUrl) {
      proxyManager.markFailed(proxyUrl);
    }
    throw e;
  }
}

// 下载视频，带延迟和重试
export async function downloadVideo(
  video: VideoItem,
  targetId: string,
  settings: AppSettings
): Promise<string | null> {
  if (!video.directDownloadUrl) {
    return null;
  }

  const baseDir = resolveDownloadDir(settings.downloadDir);
  const authorFolder = sanitizeFileName(video.authorName || 'unknown');
  const outDir = path.join(baseDir, authorFolder);
  const fileName = generateFileName(video, settings.fileNameTemplate);

  try {
    await randomDelay(settings.downloadDelayMin, settings.downloadDelayMax);

    return await downloadToFile(
      video.directDownloadUrl,
      outDir,
      fileName,
      settings
    );
  } catch (e: any) {
    console.error(`[downloader] 下载失败: ${video.platformId}`, e.message);
    return null;
  }
}