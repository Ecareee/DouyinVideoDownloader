export type SourceType = 'http_json' | 'douyin';

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
  proxyRotateStrategy: 'random'
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