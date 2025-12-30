import { Browser, BrowserContext, chromium, Page } from 'playwright';
import type { SourceAdapter } from './types.js';
import type { Target, VideoItem } from '@pkg/shared';
import { USER_AGENTS } from '@pkg/shared';
import { z } from 'zod';
import { proxyManager } from '../proxyManager.js';

const ConfigSchema = z.object({
  secUserId: z.string().min(1),
  cookie: z.string().optional(),
  headless: z.boolean().default(true)
});

interface DouyinAweme {
  aweme_id: string;
  desc: string;
  create_time: number;
  author?: {
    nickname?: string;
    uid?: string;
    sec_uid?: string;
  };
  video: {
    play_addr: {
      url_list: string[];
      width: number;
      height: number;
    };
    cover: {
      url_list: string[];
    };
    duration: number;
  };
  statistics?: {
    digg_count: number;
    comment_count: number;
    play_count: number;
  };
}

interface DouyinVideoResponse {
  status_code: number;
  aweme_list: DouyinAweme[];
  has_more: number;
  max_cursor: number;
}

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export class DouyinAdapter implements SourceAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async listVideos(target: Target): Promise<VideoItem[]> {
    const cfg = ConfigSchema.parse(JSON.parse(target.sourceConfig || '{}'));

    try {
      return await this.fetchVideos(target, cfg, true);
    } catch (e: any) {
      const errorMsg = e?.message || '';
      if (
        errorMsg.includes('ERR_TUNNEL_CONNECTION_FAILED') ||
        errorMsg.includes('ERR_PROXY_CONNECTION_FAILED') ||
        errorMsg.includes('ERR_TIMED_OUT')
      ) {
        console.log('[douyin] 代理连接失败，尝试直连...');
        await this.cleanup();
        return await this.fetchVideos(target, cfg, false);
      }
      throw e;
    }
  }

  private async fetchVideos(
    target: Target,
    cfg: z.infer<typeof ConfigSchema>,
    useProxy: boolean
  ): Promise<VideoItem[]> {
    const allVideos: VideoItem[] = [];
    const capturedResponses: DouyinVideoResponse[] = [];

    try {
      console.log(`[douyin] 开始抓取: ${target.name}${useProxy ? ' (使用代理)' : ' (直连)'}`);

      const launchOptions: any = {
        headless: cfg.headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      };

      if (useProxy && proxyManager.isEnabled()) {
        const proxyUrl = proxyManager.getNextProxy();
        if (proxyUrl) {
          console.log(`[douyin] 使用代理: ${proxyUrl}`);
          launchOptions.proxy = { server: proxyUrl };
        }
      }

      console.log(`[douyin] 正在启动浏览器...`);
      this.browser = await chromium.launch(launchOptions);

      const userAgent = getRandomUserAgent();
      console.log(`[douyin] 使用 User-Agent: ${userAgent.slice(0, 50)}...`);

      const contextOptions: any = {
        viewport: { width: 1280, height: 800 },
        userAgent,
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai'
      };

      this.context = await this.browser.newContext(contextOptions);

      if (cfg.cookie && cfg.cookie.trim()) {
        const cookies = this.parseCookieString(cfg.cookie);
        await this.context.addCookies(cookies);
        console.log(`[douyin] 已设置 ${cookies.length} 个 Cookie`);
      }

      const page = await this.context.newPage();

      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/aweme/v1/web/aweme/post/')) {
          try {
            const json = await response.json();
            if (json.aweme_list && Array.isArray(json.aweme_list)) {
              console.log(`[douyin] 捕获到 ${json.aweme_list.length} 个视频`);
              capturedResponses.push(json);
            }
          } catch {
          }
        }
      });

      const userPageUrl = `https://www.douyin.com/user/${cfg.secUserId}`;
      console.log(`[douyin] 正在访问用户主页: ${userPageUrl}`);

      await page.goto(userPageUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      console.log(`[douyin] 页面已加载，等待内容渲染...`);
      await this.sleep(3000);

      await this.closeLoginModal(page);

      try {
        await page.waitForSelector('.route-scroll-container', { timeout: 10000 });
        console.log(`[douyin] 滚动容器已就绪`);
      } catch {
        console.log(`[douyin] 未找到滚动容器，使用备用方案`);
      }

      let scrollCount = 0;
      const maxScrolls = 30;
      let lastVideoCount = 0;
      let noNewVideoCount = 0;

      while (scrollCount < maxScrolls) {
        const scrolled = await this.scrollContainer(page);

        if (!scrolled) {
          console.log(`[douyin] 已到达底部或无法滚动`);
          break;
        }

        await this.closeLoginModal(page);

        await this.sleep(1500 + Math.random() * 1000);
        scrollCount++;

        const currentVideoCount = capturedResponses.reduce((sum, r) => sum + r.aweme_list.length, 0);

        if (currentVideoCount === lastVideoCount) {
          noNewVideoCount++;
          if (noNewVideoCount >= 5) {
            console.log(`[douyin] 连续 5 次无新视频，停止滚动`);
            break;
          }
        } else {
          noNewVideoCount = 0;
          lastVideoCount = currentVideoCount;
        }

        const isBottom = await page.evaluate(() => {
          const el = document.querySelector('.route-scroll-container');
          if (!el) return false;
          return el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
        });

        if (isBottom) {
          await this.sleep(2000);
          const stillBottom = await page.evaluate(() => {
            const el = document.querySelector('.route-scroll-container');
            if (!el) return true;
            return el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
          });

          if (stillBottom) {
            console.log(`[douyin] 已到达页面底部`);
            break;
          }
        }

        console.log(`[douyin] 滚动 ${scrollCount}/${maxScrolls}，已获取 ${currentVideoCount} 个视频`);
      }

      await this.sleep(2000);

      const seenIds = new Set<string>();
      for (const response of capturedResponses) {
        for (const aweme of response.aweme_list) {
          if (seenIds.has(aweme.aweme_id)) continue;
          seenIds.add(aweme.aweme_id);

          const video = this.parseAwemeToVideoItem(aweme);
          if (video) {
            allVideos.push(video);
          }
        }
      }

      console.log(`[douyin] 总共获取 ${allVideos.length} 个唯一视频`);
      return allVideos;
    } finally {
      await this.cleanup();
    }
  }

  private async scrollContainer(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
      const container = document.querySelector('.route-scroll-container');
      if (!container) {
        const beforeY = window.scrollY;
        window.scrollBy(0, 800);
        return window.scrollY > beforeY;
      }

      const before = container.scrollTop;
      const maxScroll = container.scrollHeight - container.clientHeight;

      if (before >= maxScroll - 10) {
        return false;
      }

      container.scrollTop = Math.min(before + 800, maxScroll);

      return container.scrollTop > before;
    });
  }

  private async closeLoginModal(page: Page): Promise<void> {
    try {
      const closeSelectors = ['.YoNA2Hyj', '[class*="close"]'];
      for (const selector of closeSelectors) {
        try {
          const closeBtn = await page.$(selector);
          if (closeBtn) {
            const isVisible = await closeBtn.isVisible();
            if (isVisible) {
              await closeBtn.click();
              await this.sleep(500);
              console.log(`[douyin] 已关闭弹窗`);
              return;
            }
          }
        } catch {
        }
      }
      await page.keyboard.press('Escape');
    } catch {
    }
  }

  private parseCookieString(
    cookieStr: string
  ): Array<{ name: string; value: string; domain: string; path: string }> {
    const cookies: Array<{ name: string; value: string; domain: string; path: string }> = [];
    const pairs = cookieStr.split(';');

    for (const pair of pairs) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const name = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (name && value) {
        cookies.push({ name, value, domain: '.douyin.com', path: '/' });
      }
    }
    return cookies;
  }

  private parseAwemeToVideoItem(aweme: DouyinAweme): VideoItem | null {
    try {
      let directDownloadUrl: string | undefined;

      if (aweme.video?.play_addr?.url_list?.length > 0) {
        for (const url of aweme.video.play_addr.url_list) {
          if (url && !url.includes('playwm')) {
            directDownloadUrl = url;
            break;
          }
        }
        if (!directDownloadUrl) {
          directDownloadUrl = aweme.video.play_addr.url_list[0];
          if (directDownloadUrl?.includes('playwm')) {
            directDownloadUrl = directDownloadUrl.replace('playwm', 'play');
          }
        }
      }

      const coverUrl = aweme.video?.cover?.url_list?.[0];

      return {
        platformId: aweme.aweme_id,
        title: aweme.desc?.slice(0, 200) || `视频_${aweme.aweme_id}`,
        publishedAt: aweme.create_time
          ? new Date(aweme.create_time * 1000).toISOString()
          : undefined,
        pageUrl: `https://www.douyin.com/video/${aweme.aweme_id}`,
        coverUrl,
        directDownloadUrl,
        authorName: aweme.author?.nickname,
        authorId: aweme.author?.uid || aweme.author?.sec_uid
      };
    } catch (e) {
      console.error('[douyin] 解析视频失败:', aweme.aweme_id, e);
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async cleanup() {
    if (this.context) {
      await this.context.close().catch(() => {
      });
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {
      });
      this.browser = null;
    }
  }
}