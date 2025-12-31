import nodemailer from 'nodemailer';
import type { AppSettings } from '@pkg/shared';

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

  async send(payload: NotifyPayload): Promise<void> {
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
      }
    } catch (e: any) {
      console.error('[notify] 发送通知失败：', e.message);
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
      content: `目标: ${targetName}\n新下载: ${videoCount} 个视频\n时间: ${new Date().toLocaleString('zh-CN')}`,
      type: 'success'
    };
  } else {
    return {
      title: `抖音视频下载失败`,
      content: `目标: ${targetName}\n错误: ${error || '未知错误'}\n时间: ${new Date().toLocaleString('zh-CN')}`,
      type: 'fail'
    };
  }
}