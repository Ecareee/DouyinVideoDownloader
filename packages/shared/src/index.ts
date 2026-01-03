export type SourceType = 'http_json' | 'douyin';
export type NotifyType = 'none' | 'email' | 'wxpusher' | 'bark' | 'webhook' | 'telegram' | 'discord';

export interface Target {
  id: string;
  name: string;
  sourceType: SourceType;
  sourceConfig: string;
  createdAt: string;
  updatedAt: string;
}

export interface DouyinSourceConfig {
  secUserId: string;
  cookie?: string;
  headless?: boolean;
}

export interface VideoItem {
  platformId: string;
  title?: string;
  publishedAt?: string;
  pageUrl?: string;
  coverUrl?: string;
  directDownloadUrl?: string;
  authorName?: string;
  authorId?: string;
}

export interface Video extends VideoItem {
  id: string;
  targetId: string;
  localPath?: string;
  createdAt: string;
}

export interface JobRun {
  id: string;
  targetId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface ProxyInfo {
  id: string;
  url: string;
  protocol: string;
  latency?: number;
  lastChecked?: string;
  isValid: boolean;
  failCount: number;
  successCount: number;
}

export interface AppSettings {
  // 通用设置
  workerPollIntervalSeconds: number;
  workerConcurrency: number;
  theme: 'light' | 'dark' | 'system';

  // 下载设置
  downloadDir: string;
  fileNameTemplate: string;

  // 防封设置
  downloadDelayMin: number;
  downloadDelayMax: number;
  userDelayMin: number;
  userDelayMax: number;
  userAgentRotation: boolean;
  checkIntervalJitter: number;

  // 代理池设置
  proxyEnabled: boolean;
  proxyAutoFetch: boolean;
  proxyFetchInterval: number;
  proxyRotateStrategy: 'random' | 'round-robin' | 'least-used';

  // 通知设置
  notifyEnabled: boolean;
  notifyType: NotifyType;
  notifyOnSuccess: boolean;
  notifyOnFail: boolean;
  emailSmtpHost: string;
  emailSmtpPort: number;
  emailSmtpUser: string;
  emailSmtpPass: string;
  emailTo: string;
  wxpusherAppToken: string;
  wxpusherUid: string;
  barkUrl: string;
  webhookUrl: string;
  webhookMethod: 'GET' | 'POST';
  webhookHeaders: string;
  webhookBodyTemplate: string;
  telegramBotToken: string;
  telegramChatId: string;
  telegramProxy: string;
  telegramApiUrl: string;
  discordWebhookUrl: string;
  discordProxy: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  // 通用设置
  workerPollIntervalSeconds: 60,
  workerConcurrency: 5,
  theme: 'system',

  // 下载设置
  downloadDir: './downloads',
  fileNameTemplate: '{date}_{time}',

  // 防封设置
  downloadDelayMin: 1000,
  downloadDelayMax: 3000,
  userDelayMin: 5000,
  userDelayMax: 10000,
  userAgentRotation: true,
  checkIntervalJitter: 10,

  // 代理池设置
  proxyEnabled: false,
  proxyAutoFetch: false,
  proxyFetchInterval: 30,
  proxyRotateStrategy: 'random',

  // 通知设置
  notifyEnabled: false,
  notifyType: 'none',
  notifyOnSuccess: true,
  notifyOnFail: true,
  emailSmtpHost: '',
  emailSmtpPort: 465,
  emailSmtpUser: '',
  emailSmtpPass: '',
  emailTo: '',
  wxpusherAppToken: '',
  wxpusherUid: '',
  barkUrl: '',
  webhookUrl: '',
  webhookMethod: 'POST',
  webhookHeaders: '{}',
  webhookBodyTemplate: '{"title": "{title}", "content": "{content}", "type": "{type}"}',
  telegramBotToken: '',
  telegramChatId: '',
  telegramProxy: '',
  telegramApiUrl: '',
  discordWebhookUrl: '',
  discordProxy: ''
};

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
];

export function getNextAlignedTime(intervalMs: number): Date {
  const now = Date.now();

  // 获取当天 00:00:00 作为基准，所有执行时间都是「基准 + N × 间隔」
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const baseTime = todayStart.getTime();
  const elapsed = now - baseTime;
  const intervalsElapsed = Math.floor(elapsed / intervalMs);
  const nextTime = baseTime + (intervalsElapsed + 1) * intervalMs;

  return new Date(nextTime);
}