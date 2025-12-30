import axios from 'axios';
import type { SourceAdapter } from './types.js';
import type { Target, VideoItem } from '@pkg/shared';
import { z } from 'zod';

const ConfigSchema = z.object({
  url: z.string().url()
});

const FeedItemSchema = z.object({
  platformId: z.string().min(1),
  title: z.string().optional(),
  publishedAt: z.string().optional(),
  pageUrl: z.string().optional(),
  coverUrl: z.string().optional(),
  directDownloadUrl: z.string().url().optional(),
  authorName: z.string().optional(),
  authorId: z.string().optional()
});

const FeedSchema = z.object({
  items: z.array(FeedItemSchema)
});

export class HttpJsonAdapter implements SourceAdapter {
  async listVideos(target: Target): Promise<VideoItem[]> {
    const cfg = ConfigSchema.parse(JSON.parse(target.sourceConfig || '{}'));
    const { data } = await axios.get(cfg.url, { timeout: 15_000 });
    const feed = FeedSchema.parse(data);
    return feed.items;
  }
}