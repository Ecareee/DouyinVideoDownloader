import { AppSettings } from '@pkg/shared';

const API_BASE = '/api';

async function request<T>(method: string, path: string, body?: any): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const resp = await fetch(`${API_BASE}${path}`, options);

  if (resp.status === 204) {
    return undefined as T;
  }

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || `${method} ${path} 失败：${resp.status}`);
  }

  return resp.json();
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: any) => request<T>('POST', path, body),
  put: <T>(path: string, body: any) => request<T>('PUT', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path)
};

export const targetsApi = {
  list: () => api.get<Target[]>('/targets'),
  create: (data: CreateTargetDto) => api.post<Target>('/targets', data),
  update: (id: string, data: Partial<CreateTargetDto>) => api.put<Target>(`/targets/${id}`, data),
  delete: (id: string) => api.delete(`/targets/${id}`),
  trigger: (id: string) => api.post<JobRun>(`/targets/${id}/jobs`),
  getVideos: (id: string) => api.get<Video[]>(`/targets/${id}/videos`)
};

export const videosApi = {
  list: (params?: { targetId?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.targetId) query.set('targetId', params.targetId);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api.get<Video[]>(`/videos${qs ? `?${qs}` : ''}`);
  }
};

export const jobsApi = {
  list: () => api.get<JobRunWithTarget[]>('/jobs')
};

export const schedulersApi = {
  list: () => api.get<any[]>('/schedulers'),
  clear: () => api.delete<{ cleaned: number; total: number }>('/schedulers')
};

export const filesApi = {
  list: () => api.get<FilesResponse>('/files'),
  getDownloadUrl: (path: string) => `${API_BASE}/files/download?path=${encodeURIComponent(path)}`
};

export const settingsApi = {
  get: () => api.get<AppSettings>('/settings'),
  update: (data: Partial<AppSettings>) => api.put<AppSettings>('/settings', data),
  reset: () => api.delete<AppSettings>('/settings')
};

export const notificationsApi = {
  tests: () => api.post<{ ok: boolean }>('/notifications/tests')
};

export const proxiesApi = {
  list: () => api.get<ProxyInfo[]>('/proxies'),
  delete: (id: string) => api.delete(`/proxies/${id}`)
};

export const maintenanceApi = {
  cleanupOrphans: () => api.delete<{ ok: boolean }>('/maintenance/orphans')
};

export interface Target {
  id: string;
  name: string;
  sourceType: string;
  sourceConfig: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTargetDto {
  name: string;
  sourceType: string;
  sourceConfig: string;
}

export interface Video {
  id: string;
  targetId: string;
  platformId: string;
  title?: string;
  publishedAt?: string;
  localPath?: string;
  target?: { name: string };
}

export interface JobRun {
  id: string;
  targetId: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface JobRunWithTarget extends JobRun {
  target?: { name: string };
}

export interface FilesResponse {
  files: FileInfo[];
  totalSize: number;
  downloadDir: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  targetId?: string;
}

export interface ProxyInfo {
  id: string;
  url: string;
  protocol: string;
  isValid: boolean;
  failCount: number;
  successCount: number;
}