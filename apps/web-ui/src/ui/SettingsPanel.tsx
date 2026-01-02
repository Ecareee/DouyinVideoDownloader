import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Flex,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Typography
} from 'antd';
import { ClearOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import type { AppSettings, NotifyType } from '@pkg/shared';
import { DEFAULT_SETTINGS } from '@pkg/shared';
import { notificationsApi, schedulersApi, settingsApi } from '../api';

interface Props {
  toast: any;
  onSettingsChange?: (settings: AppSettings) => void;
}

type NotifyErrors = {
  emailSmtpHost?: string;
  emailSmtpUser?: string;
  emailSmtpPass?: string;
  emailTo?: string;
  wxpusherAppToken?: string;
  wxpusherUid?: string;
  barkUrl?: string;
};

function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      fn(...args);
      t = null;
    }, wait);
  };
}

function SettingItem({ label, description, required, error, children }: {
  label: string;
  description?: React.ReactNode;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 8 }}>
        <Typography.Text strong>
          {required && <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>}
          {label}
        </Typography.Text>
        {description && (
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
            {description}
          </Typography.Text>
        )}
      </div>
      {children}
      {error && (
        <Typography.Text type="danger" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
          {error}
        </Typography.Text>
      )}
    </div>
  );
}

export function SettingsPanel({ toast, onSettingsChange }: Props) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [testingNotify, setTestingNotify] = useState(false);
  const [notifyErrors, setNotifyErrors] = useState<NotifyErrors>({});
  const saveRef = useRef<((s: Partial<AppSettings>) => void) | null>(null);

  useEffect(() => {
    saveRef.current = debounce(async (newSettings: Partial<AppSettings>) => {
      try {
        const updated = await settingsApi.update(newSettings);
        setSettings((prev) => {
          const result = { ...prev, ...updated };
          onSettingsChange?.(result);
          return result;
        });
        toast.success('设置已保存');
      } catch (e: any) {
        toast.error('保存失败：' + e.message);
      }
    }, 800);
  }, [toast, onSettingsChange]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await settingsApi.get();
        const merged = { ...DEFAULT_SETTINGS, ...data };
        setSettings(merged);
        onSettingsChange?.(merged);
      } catch (e: any) {
        toast.error('加载设置失败：' + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    saveRef.current?.({ [key]: value });
    if (key in notifyErrors) {
      setNotifyErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handleCleanupJobs = async () => {
    setCleaning(true);
    try {
      const result = await schedulersApi.clear();
      toast.success(`已清理 ${result.cleaned} 个定时任务，请重启 Worker 服务`);
    } catch (e: any) {
      toast.error('清理失败：' + e.message);
    } finally {
      setCleaning(false);
    }
  };

  const handleResetSettings = async () => {
    try {
      const updated = await settingsApi.reset();
      setSettings(updated);
      onSettingsChange?.(updated);
      toast.success('已重置为默认设置');
    } catch (e: any) {
      toast.error('重置失败：' + e.message);
    }
  };

  const validateNotifyConfig = (): boolean => {
    const errors: NotifyErrors = {};

    if (settings.notifyType === 'email') {
      if (!settings.emailSmtpHost) errors.emailSmtpHost = '请输入 SMTP 服务器';
      if (!settings.emailSmtpUser) errors.emailSmtpUser = '请输入发件人账号';
      if (!settings.emailSmtpPass) errors.emailSmtpPass = '请输入发件人密码';
      if (!settings.emailTo) errors.emailTo = '请输入收件人邮箱';
    } else if (settings.notifyType === 'wxpusher') {
      if (!settings.wxpusherAppToken) errors.wxpusherAppToken = '请输入 AppToken';
      if (!settings.wxpusherUid) errors.wxpusherUid = '请输入用户 UID';
    } else if (settings.notifyType === 'bark') {
      if (!settings.barkUrl) errors.barkUrl = '请输入 Bark 推送地址';
    }

    setNotifyErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTestNotify = async () => {
    if (!validateNotifyConfig()) return;
    setTestingNotify(true);
    try {
      await notificationsApi.tests();
      toast.success('测试通知已发送，请检查是否收到');
    } catch (e: any) {
      toast.error('发送失败：' + e.message);
    } finally {
      setTestingNotify(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large"/>
      </div>
    );
  }

  const showNotifyDetails = settings.notifyEnabled && settings.notifyType !== 'none';

  const tabItems = [
    {
      key: 'general',
      label: '通用设置',
      children: (
        <Flex vertical gap={0} style={{ padding: '16px' }}>
          <SettingItem label="轮询间隔（秒）" description="自动检查新视频的间隔时间">
            <InputNumber
              value={settings.workerPollIntervalSeconds}
              onChange={(v) => updateField('workerPollIntervalSeconds', v || 60)}
              min={10}
              max={3600}
              step={10}
              style={{ width: 120 }}
            />
          </SettingItem>

          <SettingItem label="任务并发数" description="同时执行的任务数量">
            <InputNumber
              value={settings.workerConcurrency}
              onChange={(v) => updateField('workerConcurrency', v || 2)}
              min={1}
              max={10}
              style={{ width: 120 }}
            />
          </SettingItem>

          <Divider style={{ margin: '4px 0 16px' }}/>

          <SettingItem label="下载目录" description="相对于项目根目录的路径，或绝对路径">
            <Input
              value={settings.downloadDir}
              onChange={(e) => updateField('downloadDir', e.target.value)}
              placeholder="./downloads"
              style={{ maxWidth: 400 }}
            />
          </SettingItem>

          <SettingItem
            label="文件名模板"
            description="可用变量：{author} 作者名，{date} 日期，{time} 时间，{id} 视频 ID，{title} 标题"
          >
            <Input
              value={settings.fileNameTemplate}
              onChange={(e) => updateField('fileNameTemplate', e.target.value)}
              placeholder="{date}_{time}"
              style={{ maxWidth: 400 }}
            />
          </SettingItem>

          <Divider style={{ margin: '4px 0 16px' }}/>

          <SettingItem label="主题模式">
            <Select
              value={settings.theme}
              onChange={(v) => updateField('theme', v)}
              options={[
                { label: '跟随系统', value: 'system' },
                { label: '浅色', value: 'light' },
                { label: '深色', value: 'dark' }
              ]}
              style={{ width: 200 }}
            />
          </SettingItem>
        </Flex>
      )
    },
    {
      key: 'anti-ban',
      label: '防封设置',
      children: (
        <Flex vertical gap={0} style={{ padding: '16px' }}>
          <SettingItem label="下载延迟（毫秒）" description="同一用户的视频之间的随机等待时间">
            <Space size="middle">
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  最小
                </Typography.Text>
                <InputNumber
                  value={settings.downloadDelayMin}
                  onChange={(v) => updateField('downloadDelayMin', v || 1000)}
                  min={0}
                  max={60000}
                  step={500}
                  style={{ width: 100 }}
                />
              </div>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  最大
                </Typography.Text>
                <InputNumber
                  value={settings.downloadDelayMax}
                  onChange={(v) => updateField('downloadDelayMax', v || 3000)}
                  min={0}
                  max={60000}
                  step={500}
                  style={{ width: 100 }}
                />
              </div>
            </Space>
          </SettingItem>

          <SettingItem label="用户间延迟（毫秒）" description="不同监控目标之间的随机等待时间">
            <Space size="middle">
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  最小
                </Typography.Text>
                <InputNumber
                  value={settings.userDelayMin}
                  onChange={(v) => updateField('userDelayMin', v || 5000)}
                  min={0}
                  max={120000}
                  step={1000}
                  style={{ width: 100 }}
                />
              </div>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  最大
                </Typography.Text>
                <InputNumber
                  value={settings.userDelayMax}
                  onChange={(v) => updateField('userDelayMax', v || 10000)}
                  min={0}
                  max={120000}
                  step={1000}
                  style={{ width: 100 }}
                />
              </div>
            </Space>
          </SettingItem>

          <Divider style={{ margin: '4px 0 16px' }}/>

          <SettingItem label="User-Agent 轮换" description="自动切换浏览器标识，降低被检测风险">
            <Switch
              checked={settings.userAgentRotation}
              onChange={(v) => updateField('userAgentRotation', v)}
            />
          </SettingItem>

          <SettingItem label="检查间隔抖动（%）" description="给轮询间隔添加随机波动">
            <InputNumber
              value={settings.checkIntervalJitter}
              onChange={(v) => updateField('checkIntervalJitter', v || 10)}
              min={0}
              max={50}
              style={{ width: 120 }}
            />
          </SettingItem>

          <Divider style={{ margin: '4px 0 16px' }}/>

          <SettingItem label="启用代理" description="使用代理池访问抖音">
            <Switch
              checked={settings.proxyEnabled}
              onChange={(v) => updateField('proxyEnabled', v)}
            />
          </SettingItem>

          <SettingItem label="自动爬取代理" description="从公开代理源自动获取免费代理">
            <Switch
              checked={settings.proxyAutoFetch}
              onChange={(v) => updateField('proxyAutoFetch', v)}
            />
          </SettingItem>

          <SettingItem label="代理爬取间隔（分钟）">
            <InputNumber
              value={settings.proxyFetchInterval}
              onChange={(v) => updateField('proxyFetchInterval', v || 30)}
              min={5}
              max={1440}
              style={{ width: 120 }}
            />
          </SettingItem>

          <SettingItem label="代理轮换策略">
            <Select
              value={settings.proxyRotateStrategy}
              onChange={(v) => updateField('proxyRotateStrategy', v)}
              options={[
                { label: '随机选择', value: 'random' },
                { label: '轮询', value: 'round-robin' },
                { label: '最少使用', value: 'least-used' }
              ]}
              style={{ width: 200 }}
            />
          </SettingItem>
        </Flex>
      )
    },
    {
      key: 'notify',
      label: '通知设置',
      children: (
        <Flex vertical gap={0} style={{ padding: '16px' }}>
          <SettingItem label="启用通知" description="当有新视频下载或任务失败时发送通知">
            <Switch
              checked={settings.notifyEnabled}
              onChange={(v) => {
                updateField('notifyEnabled', v);
                setNotifyErrors({});
              }}
            />
          </SettingItem>

          {settings.notifyEnabled && (
            <>
              <SettingItem label="通知方式">
                <Select
                  value={settings.notifyType}
                  onChange={(v) => {
                    updateField('notifyType', v as NotifyType);
                    setNotifyErrors({});
                  }}
                  options={[
                    { label: '不通知', value: 'none' },
                    { label: '邮件', value: 'email' },
                    { label: 'WxPusher', value: 'wxpusher' },
                    { label: 'Bark', value: 'bark' }
                  ]}
                  style={{ width: 200 }}
                />
              </SettingItem>

              {showNotifyDetails && (
                <>
                  <SettingItem label="通知时机">
                    <Flex vertical gap={8}>
                      <Checkbox
                        checked={settings.notifyOnSuccess}
                        onChange={(e) => updateField('notifyOnSuccess', e.target.checked)}
                      >
                        下载成功时
                      </Checkbox>
                      <Checkbox
                        checked={settings.notifyOnFail}
                        onChange={(e) => updateField('notifyOnFail', e.target.checked)}
                      >
                        任务失败时
                      </Checkbox>
                    </Flex>
                  </SettingItem>

                  <Divider style={{ margin: '4px 0 16px' }}/>

                  {settings.notifyType === 'email' && (
                    <>
                      <SettingItem label="SMTP 服务器" required error={notifyErrors.emailSmtpHost}>
                        <Space size="middle">
                          <Input
                            value={settings.emailSmtpHost}
                            onChange={(e) => updateField('emailSmtpHost', e.target.value)}
                            placeholder="请输入 SMTP 服务器"
                            style={{ width: 200 }}
                            status={notifyErrors.emailSmtpHost ? 'error' : undefined}
                          />
                          <InputNumber
                            value={settings.emailSmtpPort}
                            onChange={(v) => updateField('emailSmtpPort', v || 465)}
                            min={1}
                            max={65535}
                            placeholder="请输入端口"
                            style={{ width: 100 }}
                          />
                        </Space>
                      </SettingItem>

                      <SettingItem label="发件人账号" description="SMTP 登录用户名" required
                                   error={notifyErrors.emailSmtpUser}>
                        <Input
                          value={settings.emailSmtpUser}
                          onChange={(e) => updateField('emailSmtpUser', e.target.value)}
                          placeholder="请输入发件人账号"
                          style={{ maxWidth: 300 }}
                          status={notifyErrors.emailSmtpUser ? 'error' : undefined}
                        />
                      </SettingItem>

                      <SettingItem label="发件人密码" description="SMTP 授权码" required
                                   error={notifyErrors.emailSmtpPass}>
                        <Input.Password
                          value={settings.emailSmtpPass}
                          onChange={(e) => updateField('emailSmtpPass', e.target.value)}
                          placeholder="请输入发件人密码"
                          style={{ maxWidth: 300 }}
                          status={notifyErrors.emailSmtpPass ? 'error' : undefined}
                        />
                      </SettingItem>

                      <SettingItem label="收件人邮箱" required error={notifyErrors.emailTo}>
                        <Input
                          value={settings.emailTo}
                          onChange={(e) => updateField('emailTo', e.target.value)}
                          placeholder="receive@example.com"
                          style={{ maxWidth: 300 }}
                          status={notifyErrors.emailTo ? 'error' : undefined}
                        />
                      </SettingItem>
                    </>
                  )}

                  {settings.notifyType === 'wxpusher' && (
                    <>
                      <SettingItem
                        label="AppToken"
                        required
                        error={notifyErrors.wxpusherAppToken}
                        description={
                          <>
                            在{' '}
                            <a href="https://wxpusher.zjiecode.com/admin/main/app/appToken" target="_blank"
                               rel="noreferrer">
                              WxPusher 后台
                            </a>
                            {' '}获取
                          </>
                        }
                      >
                        <Input.Password
                          value={settings.wxpusherAppToken}
                          onChange={(e) => updateField('wxpusherAppToken', e.target.value)}
                          placeholder="AT_xxx"
                          style={{ maxWidth: 400 }}
                          status={notifyErrors.wxpusherAppToken ? 'error' : undefined}
                        />
                      </SettingItem>

                      <SettingItem label="用户 UID" description="关注应用后获取的 UID" required
                                   error={notifyErrors.wxpusherUid}>
                        <Input
                          value={settings.wxpusherUid}
                          onChange={(e) => updateField('wxpusherUid', e.target.value)}
                          placeholder="UID_xxx"
                          style={{ maxWidth: 400 }}
                          status={notifyErrors.wxpusherUid ? 'error' : undefined}
                        />
                      </SettingItem>
                    </>
                  )}

                  {settings.notifyType === 'bark' && (
                    <SettingItem
                      label="Bark 推送地址"
                      description="iOS Bark App 中复制的推送 URL"
                      required
                      error={notifyErrors.barkUrl}
                    >
                      <Input
                        value={settings.barkUrl}
                        onChange={(e) => updateField('barkUrl', e.target.value)}
                        placeholder="https://api.day.app/YOUR_KEY/"
                        style={{ maxWidth: 400 }}
                        status={notifyErrors.barkUrl ? 'error' : undefined}
                      />
                    </SettingItem>
                  )}

                  <Divider style={{ margin: '4px 0 16px' }}/>

                  <SettingItem label="测试通知" description="发送一条测试消息验证配置是否正确">
                    <Button
                      icon={<SendOutlined/>}
                      onClick={handleTestNotify}
                      loading={testingNotify}
                    >
                      发送测试通知
                    </Button>
                  </SettingItem>
                </>
              )}
            </>
          )}
        </Flex>
      )
    },
    {
      key: 'maintenance',
      label: '维护操作',
      children: (
        <Flex vertical gap={0} style={{ padding: '16px' }}>
          <SettingItem label="清理定时任务" description="如果有已删除目标的任务仍在执行，点击此按钮清理后重启 Worker">
            <Button
              icon={<ClearOutlined/>}
              onClick={handleCleanupJobs}
              loading={cleaning}
              danger
            >
              清理所有定时任务
            </Button>
          </SettingItem>

          <SettingItem label="重置设置" description="将所有设置恢复为默认值">
            <Popconfirm
              title="确定要重置所有设置吗？"
              onConfirm={handleResetSettings}
              okText="确定"
              cancelText="取消"
            >
              <Button icon={<ReloadOutlined/>}>
                重置为默认值
              </Button>
            </Popconfirm>
          </SettingItem>
        </Flex>
      )
    }
  ];

  return (
    <Card styles={{ body: { padding: 0 } }} style={{ width: '100%' }}>
      <Tabs items={tabItems} tabBarStyle={{ paddingLeft: 16, marginBottom: 0 }}/>
    </Card>
  );
}