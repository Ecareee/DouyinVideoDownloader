import type { SourceAdapter } from './types.js';
import { HttpJsonAdapter } from './httpJson.js';
import { DouyinAdapter } from './douyin.js';
import type { SourceType, Target } from '@pkg/shared';

export function makeAdapter(target: Target): SourceAdapter {
  const st = target.sourceType as SourceType;
  switch (st) {
    case 'http_json':
      return new HttpJsonAdapter();
    case 'douyin':
      return new DouyinAdapter();
    default:
      return new DouyinAdapter();
  }
}

export * from './types.js';