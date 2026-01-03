import nodemailer from 'nodemailer';
import type { AppSettings } from '@pkg/shared';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

interface NotifyPayload {
  title: string;
  content: string;
  type: 'success' | 'fail';
}

export class Notifier {
  private settings: AppSettings;

  constructor(settings: AppSettings) {
    this.settings = settings;
  }

  async send(payload: NotifyPayload, throwOnError = false): Promise<void> {
    if (!this.settings.notifyEnabled) return;
    if (payload.type === 'success' && !this.settings.notifyOnSuccess) return;
    if (payload.type === 'fail' && !this.settings.notifyOnFail) return;

    try {
      switch (this.settings.notifyType) {
        case 'email':
          await this.sendEmail(payload);
          break;
        case 'wxpusher':
          await this.sendWxPusher(payload);
          break;
        case 'bark':
          await this.sendBark(payload);
          break;
        case 'webhook':
          await this.sendWebhook(payload);
          break;
        case 'telegram':
          await this.sendTelegram(payload);
          break;
        case 'discord':
          await this.sendDiscord(payload);
          break;
      }
    } catch (e: any) {
      console.error('[notify] 发送通知失败：', e.message);
      if (throwOnError) {
        throw e;
      }
    }
  }

  private async sendEmail(payload: NotifyPayload): Promise<void> {
    const { emailSmtpHost, emailSmtpPort, emailSmtpUser, emailSmtpPass, emailTo } = this.settings;

    if (!emailSmtpHost || !emailSmtpUser || !emailTo) {
      console.log('[notify] 邮箱配置不完整，跳过');
      return;
    }

    const transporter = nodemailer.createTransport({
      host: emailSmtpHost,
      port: emailSmtpPort,
      secure: emailSmtpPort === 465,
      auth: {
        user: emailSmtpUser,
        pass: emailSmtpPass
      }
    });

    await transporter.sendMail({
      from: emailSmtpUser,
      to: emailTo,
      subject: payload.title,
      text: payload.content,
      html: `<p>${payload.content.replace(/\n/g, '<br>')}</p>`
    });

    console.log('[notify] 邮件发送成功');
  }

  private async sendWxPusher(payload: NotifyPayload): Promise<void> {
    const { wxpusherAppToken, wxpusherUid } = this.settings;

    if (!wxpusherAppToken || !wxpusherUid) {
      console.log('[notify] WxPusher 配置不完整，跳过');
      return;
    }

    const resp = await fetch('https://wxpusher.zjiecode.com/api/send/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appToken: wxpusherAppToken,
        content: `${payload.title}\n\n${payload.content}`,
        contentType: 1,
        uids: [wxpusherUid]
      })
    });

    const result = await resp.json();
    if (result.code !== 1000) {
      throw new Error(result.msg || 'WxPusher 发送失败');
    }

    console.log('[notify] WxPusher 发送成功');
  }

  private async sendBark(payload: NotifyPayload): Promise<void> {
    const { barkUrl } = this.settings;

    if (!barkUrl) {
      console.log('[notify] Bark 配置不完整，跳过');
      return;
    }

    const url = barkUrl.endsWith('/') ? barkUrl : barkUrl + '/';
    const encodedTitle = encodeURIComponent(payload.title);
    const encodedContent = encodeURIComponent(payload.content);

    const resp = await fetch(`${url}${encodedTitle}/${encodedContent}`);

    if (!resp.ok) {
      throw new Error(`Bark 发送失败：${resp.status}`);
    }

    console.log('[notify] Bark 发送成功');
  }

  private async sendWebhook(payload: NotifyPayload): Promise<void> {
    const { webhookUrl, webhookMethod, webhookHeaders, webhookBodyTemplate } = this.settings;

    if (!webhookUrl) {
      console.log('[notify] Webhook URL 未配置，跳过');
      return;
    }

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const customHeaders = JSON.parse(webhookHeaders || '{}');
      headers = { ...headers, ...customHeaders };
    } catch {
      console.warn('[notify] Webhook headers 解析失败，使用默认 headers');
    }

    const body = webhookBodyTemplate
      .replace(/{title}/g, payload.title)
      .replace(/{content}/g, payload.content)
      .replace(/{type}/g, payload.type)
      .replace(/{timestamp}/g, new Date().toISOString());

    const options: RequestInit = {
      method: webhookMethod,
      headers
    };

    // GET 请求不带 body
    if (webhookMethod === 'POST') {
      options.body = body;
    }

    const resp = await fetch(webhookUrl, options);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Webhook 发送失败：${resp.status} ${text}`);
    }

    console.log('[notify] Webhook 发送成功');
  }

  private async sendTelegram(payload: NotifyPayload): Promise<void> {
    const { telegramBotToken, telegramChatId, telegramProxy, telegramApiUrl } = this.settings;

    if (!telegramBotToken || !telegramChatId) {
      console.log('[notify] Telegram 配置不完整，跳过');
      return;
    }

    const text = `${payload.title}\n\n${payload.content}`;

    const body = JSON.stringify({
      chat_id: telegramChatId,
      text,
      disable_web_page_preview: true
    });

    const apiBase = telegramApiUrl || 'https://api.telegram.org';
    const url = `${apiBase}/bot${telegramBotToken}/sendMessage`;

    try {
      const axios = (await import('axios')).default;

      const axiosConfig: any = {
        method: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        data: body,
        timeout: 30000
      };

      if (telegramProxy && !telegramApiUrl) {
        console.log(`[notify] Telegram 使用代理：${telegramProxy}`);

        if (telegramProxy.startsWith('socks')) {
          const agent = new SocksProxyAgent(telegramProxy);
          axiosConfig.httpAgent = agent;
          axiosConfig.httpsAgent = agent;
        } else {
          const agent = new HttpsProxyAgent(telegramProxy);
          axiosConfig.httpAgent = agent;
          axiosConfig.httpsAgent = agent;
        }
        axiosConfig.proxy = false;
      }

      if (telegramApiUrl) {
        console.log(`[notify] Telegram 使用反代：${telegramApiUrl}`);
      }

      const resp = await axios(axiosConfig);
      const result = resp.data;

      if (!result.ok) {
        throw new Error(this.formatTelegramError(`${result.error_code} ${result.description || '未知错误'}`));
      }

      console.log('[notify] Telegram 发送成功');
    } catch (e: any) {
      const errMsg = e.response?.data?.description || e.message || '未知错误';
      throw new Error(this.formatTelegramError(errMsg));
    }
  }

  private formatTelegramError(errMsg: string): string {
    if (errMsg.includes('chat not found')) {
      return 'Chat ID 不存在或 Bot 未加入该群组/频道';
    } else if (errMsg.includes('bot was blocked')) {
      return 'Bot 已被用户屏蔽';
    } else if (errMsg.includes('Unauthorized') || errMsg.includes('401')) {
      return 'Bot Token 无效，请检查是否正确';
    } else if (errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNREFUSED') || errMsg.includes('timeout')) {
      return '连接超时，中国大陆需配置代理或使用反代地址';
    } else if (errMsg.includes('ENOTFOUND') || errMsg.includes('getaddrinfo')) {
      return 'DNS 解析失败，请检查网络连接';
    } else if (errMsg.includes('404')) {
      return 'API 地址无效，请检查反代地址是否正确';
    } else if (errMsg.includes('502') || errMsg.includes('503') || errMsg.includes('504')) {
      return '服务暂时不可用，请稍后重试';
    } else if (errMsg.includes('ECONNRESET')) {
      return '连接被重置，可能被防火墙拦截，请使用代理';
    }
    return errMsg;
  }

  private async sendDiscord(payload: NotifyPayload): Promise<void> {
    const { discordWebhookUrl, discordProxy } = this.settings;

    if (!discordWebhookUrl) {
      console.log('[notify] Discord Webhook URL 未配置，跳过');
      return;
    }

    const embed = {
      title: payload.title,
      description: payload.content,
      color: payload.type === 'success' ? 0x00ff00 : 0xff0000,
      timestamp: new Date().toISOString(),
      footer: {
        text: '抖音视频自动监控下载工具'
      }
    };

    try {
      const axios = (await import('axios')).default;

      const axiosConfig: any = {
        method: 'POST',
        url: discordWebhookUrl,
        headers: { 'Content-Type': 'application/json' },
        data: { embeds: [embed] },
        timeout: 30000
      };

      if (discordProxy) {
        console.log(`[notify] Discord 使用代理：${discordProxy}`);

        if (discordProxy.startsWith('socks')) {
          const agent = new SocksProxyAgent(discordProxy);
          axiosConfig.httpAgent = agent;
          axiosConfig.httpsAgent = agent;
        } else {
          const agent = new HttpsProxyAgent(discordProxy);
          axiosConfig.httpAgent = agent;
          axiosConfig.httpsAgent = agent;
        }
        axiosConfig.proxy = false;
      }

      await axios(axiosConfig);
      console.log('[notify] Discord 发送成功');
    } catch (e: any) {
      const errMsg = e.response?.data?.message || e.message || '未知错误';
      throw new Error(this.formatDiscordError(errMsg));
    }
  }

  private formatDiscordError(errMsg: string): string {
    if (errMsg.includes('Unknown Webhook') || errMsg.includes('Invalid Webhook Token')) {
      return 'Webhook URL 无效，请检查是否正确';
    } else if (errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNREFUSED') || errMsg.includes('timeout')) {
      return '连接超时，中国大陆需配置代理';
    } else if (errMsg.includes('ENOTFOUND') || errMsg.includes('getaddrinfo')) {
      return 'DNS 解析失败，请检查网络连接';
    } else if (errMsg.includes('ECONNRESET')) {
      return '连接被重置，可能被防火墙拦截，请使用代理';
    } else if (errMsg.includes('rate limit') || errMsg.includes('429')) {
      return '请求过于频繁，请稍后重试';
    }
    return errMsg;
  }
}

export function createNotifyPayload(
  type: 'success' | 'fail',
  targetName: string,
  videoCount: number,
  error?: string
): NotifyPayload {
  if (type === 'success') {
    return {
      title: `抖音视频下载成功`,
      content: `目标：${targetName}\n新下载：${videoCount} 个视频\n时间：${new Date().toLocaleString('zh-CN')}`,
      type: 'success'
    };
  } else {
    return {
      title: `抖音视频下载失败`,
      content: `目标：${targetName}\n错误：${error || '未知错误'}\n时间：${new Date().toLocaleString('zh-CN')}`,
      type: 'fail'
    };
  }
}