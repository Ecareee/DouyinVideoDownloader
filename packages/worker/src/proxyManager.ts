import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { AppSettings } from '@pkg/shared';

const PROXY_SOURCES = [
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
  'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',

  'https://gh-proxy.com/https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://gh-proxy.com/https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
  'https://gh-proxy.com/https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt'
];

interface ProxyInfo {
  url: string;
  protocol: string;
  latency?: number;
  lastChecked?: Date;
  isValid: boolean;
  failCount: number;
  successCount: number;
}

export class ProxyManager {
  private proxies: ProxyInfo[] = [];
  private currentIndex = 0;
  private strategy: 'random' | 'round-robin' | 'least-used' = 'random';
  private enabled = false;
  private autoFetch = false;
  private fetchInterval = 30; // 分钟
  private lastFetch: Date | null = null;

  configure(settings: AppSettings) {
    this.enabled = settings.proxyEnabled;
    this.autoFetch = settings.proxyAutoFetch;
    this.fetchInterval = settings.proxyFetchInterval;
    this.strategy = settings.proxyRotateStrategy;
    this.currentIndex = 0;
  }

  isEnabled(): boolean {
    return this.enabled && this.proxies.length > 0;
  }

  async fetchProxies(): Promise<void> {
    if (!this.autoFetch) return;

    const now = new Date();
    if (this.lastFetch && now.getTime() - this.lastFetch.getTime() < this.fetchInterval * 60 * 1000) {
      return; // 未到爬取时间
    }

    console.log('[proxy] 开始爬取公开代理...');
    const newProxies: ProxyInfo[] = [];
    let successCount = 0;

    for (const source of PROXY_SOURCES) {
      try {
        const resp = await axios.get(source, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const lines = String(resp.data).split('\n').filter((l: string) => l.trim());

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.match(/^\d+\.\d+\.\d+\.\d+:\d+$/)) {
            const url = `http://${trimmed}`;
            if (!newProxies.find(p => p.url === url)) {
              newProxies.push({
                url,
                protocol: 'http',
                isValid: true,
                failCount: 0,
                successCount: 0
              });
            }
          } else if (trimmed.startsWith('socks')) {
            if (!newProxies.find(p => p.url === trimmed)) {
              newProxies.push({
                url: trimmed,
                protocol: trimmed.split('://')[0],
                isValid: true,
                failCount: 0,
                successCount: 0
              });
            }
          }
        }
        successCount++;
        console.log(`[proxy] 从 ${new URL(source).hostname} 获取成功`);
      } catch {
        console.log(`[proxy] 跳过不可用源: ${new URL(source).hostname}`);
      }
    }

    if (successCount === 0) {
      console.log('[proxy] 所有代理源均不可用，跳过本次爬取');
      return;
    }

    console.log(`[proxy] 爬取完成，获取 ${newProxies.length} 个代理`);

    for (const proxy of newProxies) {
      const existing = this.proxies.find(p => p.url === proxy.url);
      if (!existing) {
        this.proxies.push(proxy);
      }
    }

    this.lastFetch = now;

    // 异步验证代理，不阻塞主流程
    if (newProxies.length > 0) {
      this.validateProxies().catch(() => {
      });
    }
  }

  async validateProxies(): Promise<void> {
    if (this.proxies.length === 0) return;

    console.log(`[proxy] 开始验证 ${this.proxies.length} 个代理...`);

    const testUrl = 'https://httpbin.org/ip';
    const validProxies: ProxyInfo[] = [];

    // 并发验证，每次 10 个
    const chunks = [];
    for (let i = 0; i < this.proxies.length; i += 10) {
      chunks.push(this.proxies.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(async (proxy) => {
          try {
            const agent = this.createAgent(proxy.url);
            const start = Date.now();
            await axios.get(testUrl, {
              httpAgent: agent,
              httpsAgent: agent,
              timeout: 5000
            });
            proxy.latency = Date.now() - start;
            proxy.lastChecked = new Date();
            proxy.isValid = true;
            return proxy;
          } catch {
            proxy.isValid = false;
            proxy.failCount++;
            return null;
          }
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          validProxies.push(result.value);
        }
      }
    }

    this.proxies = validProxies;
    console.log(`[proxy] 验证完成，有效代理: ${this.proxies.length}`);
  }

  addProxy(url: string, protocol: string = 'http') {
    if (!this.proxies.find(p => p.url === url)) {
      this.proxies.push({
        url,
        protocol,
        isValid: true,
        failCount: 0,
        successCount: 0
      });
    }
  }

  getNextProxy(): string | null {
    if (!this.enabled) {
      console.log('[proxy] 代理未启用');
      return null;
    }

    if (this.proxies.length === 0) {
      console.log('[proxy] 代理池为空');
      return null;
    }

    const validProxies = this.proxies.filter(p => p.isValid && p.failCount < 3);
    console.log(`[proxy] 代理池状态: 总数=${this.proxies.length}, 有效=${validProxies.length}`);

    if (validProxies.length === 0) {
      console.log('[proxy] 没有可用的代理');
      return null;
    }

    let proxy: ProxyInfo;

    if (this.strategy === 'random') {
      const idx = Math.floor(Math.random() * validProxies.length);
      proxy = validProxies[idx];
    } else if (this.strategy === 'least-used') {
      proxy = validProxies.reduce((min, p) =>
          p.successCount < min.successCount ? p : min
        , validProxies[0]);
    } else {
      proxy = validProxies[this.currentIndex % validProxies.length];
      this.currentIndex++;
    }

    console.log(`[proxy] 选择代理: ${proxy.url} (策略: ${this.strategy}, 成功次数: ${proxy.successCount}, 失败次数: ${proxy.failCount})`);
    return proxy.url;
  }

  createAgent(proxyUrl: string): HttpsProxyAgent<string> | SocksProxyAgent {
    if (proxyUrl.startsWith('socks')) {
      return new SocksProxyAgent(proxyUrl);
    }
    return new HttpsProxyAgent(proxyUrl);
  }

  getAgent(): HttpsProxyAgent<string> | SocksProxyAgent | undefined {
    const proxy = this.getNextProxy();
    if (!proxy) return undefined;
    console.log(`[proxy] 使用代理: ${proxy}`);
    return this.createAgent(proxy);
  }

  markSuccess(proxyUrl: string) {
    const proxy = this.proxies.find(p => p.url === proxyUrl);
    if (proxy) {
      proxy.successCount++;
      proxy.failCount = 0;
    }
  }

  markFailed(proxyUrl: string) {
    const proxy = this.proxies.find(p => p.url === proxyUrl);
    if (proxy) {
      proxy.failCount++;
      if (proxy.failCount >= 3) {
        proxy.isValid = false;
      }
    }
  }

  getStats() {
    return {
      total: this.proxies.length,
      valid: this.proxies.filter(p => p.isValid).length,
      enabled: this.enabled
    };
  }
}

export const proxyManager = new ProxyManager();