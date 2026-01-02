import path from 'node:path';
import { prisma } from './db';
import { AppSettings, DEFAULT_SETTINGS } from '@pkg/shared';

export const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../../');

export async function getSettings(): Promise<AppSettings> {
  try {
    const config = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
    if (!config) {
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(config.settings) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  await prisma.appConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', settings: JSON.stringify(merged) },
    update: { settings: JSON.stringify(merged) }
  });
  return merged;
}

export function resolveDownloadDir(downloadDir: string): string {
  if (path.isAbsolute(downloadDir)) {
    return downloadDir;
  }
  return path.resolve(PROJECT_ROOT, downloadDir);
}