import { chromium } from 'playwright';
import { USER_AGENTS } from '@pkg/shared';

const TEST_CONFIG = {
  secUserId: '',
  cookie: '',
  scrollCount: 15
};

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function parseCookieString(cookieStr: string) {
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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('抖音爬取测试\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: getRandomUserAgent(),
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  });

  if (TEST_CONFIG.cookie) {
    const cookies = parseCookieString(TEST_CONFIG.cookie);
    await context.addCookies(cookies);
    console.log(`已设置 ${cookies.length} 个 Cookie`);
  }

  const page = await context.newPage();
  const capturedVideos: any[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/aweme/v1/web/aweme/post/')) {
      try {
        const json = await response.json();
        if (json.aweme_list && Array.isArray(json.aweme_list)) {
          console.log(`[API] 捕获到 ${json.aweme_list.length} 个视频 (总计: ${capturedVideos.length + json.aweme_list.length})`);
          capturedVideos.push(...json.aweme_list);
        }
      } catch {
      }
    }
  });

  const url = `https://www.douyin.com/user/${TEST_CONFIG.secUserId}`;
  console.log(`访问: ${url}\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);

  try {
    const closeBtn = await page.$('.YoNA2Hyj');
    if (closeBtn && await closeBtn.isVisible()) {
      await closeBtn.click();
      console.log('已关闭登录弹窗\n');
      await sleep(1000);
    }
  } catch {
  }

  await page.waitForSelector('.route-scroll-container', { timeout: 10000 }).catch(() => {
  });

  console.log(`开始滚动 (${TEST_CONFIG.scrollCount} 次)...\n`);

  for (let i = 0; i < TEST_CONFIG.scrollCount; i++) {
    // 使用 .route-scroll-container 滚动
    const scrollResult = await page.evaluate(() => {
      const container = document.querySelector('.route-scroll-container');
      if (!container) return { success: false, reason: '容器不存在' };

      const before = container.scrollTop;
      const maxScroll = container.scrollHeight - container.clientHeight;

      if (before >= maxScroll - 10) {
        return { success: false, reason: '已到底部', before, max: maxScroll };
      }

      container.scrollTop = Math.min(before + 800, maxScroll);

      return {
        success: container.scrollTop > before,
        before,
        after: container.scrollTop,
        max: maxScroll
      };
    });

    if (scrollResult.success) {
      console.log(`滚动 ${i + 1}: ${scrollResult.before} -> ${scrollResult.after} / ${scrollResult.max} ✓`);
    } else {
      console.log(`滚动 ${i + 1}: ${scrollResult.reason}`);
      if (scrollResult.reason === '已到底部') {
        await sleep(2000);
        const newMax = await page.evaluate(() => {
          const container = document.querySelector('.route-scroll-container');
          return container ? container.scrollHeight - container.clientHeight : 0;
        });

        if (newMax > (scrollResult.max || 0)) {
          console.log(`新内容已加载，继续滚动...`);
        } else {
          console.log(`确认到底，停止滚动`);
          break;
        }
      }
    }

    await sleep(1500);
    console.log(`当前视频数: ${capturedVideos.length}`);
  }

  const uniqueIds = new Set(capturedVideos.map(v => v.aweme_id));

  console.log(`\n========== 结果 ==========`);
  console.log(`捕获总数: ${capturedVideos.length}`);
  console.log(`去重后: ${uniqueIds.size}`);

  if (capturedVideos.length > 0) {
    console.log(`\n前 5 个视频:`);
    const seen = new Set();
    let count = 0;
    for (const v of capturedVideos) {
      if (seen.has(v.aweme_id)) continue;
      seen.add(v.aweme_id);
      console.log(`  ${++count}. ${v.desc?.slice(0, 40) || '无标题'}`);
      if (count >= 5) break;
    }
  }

  console.log(`\n浏览器保持打开 60 秒`);
  await sleep(60000);
  await browser.close();
}

main().catch(console.error);