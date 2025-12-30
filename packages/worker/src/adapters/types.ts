import type { Target, VideoItem } from '@pkg/shared';

export interface SourceAdapter {
  listVideos(target: Target): Promise<VideoItem[]>;
}

export class AdapterError extends Error {
  constructor(message: string, public meta?: Record<string, unknown>) {
    super(message);
  }
}