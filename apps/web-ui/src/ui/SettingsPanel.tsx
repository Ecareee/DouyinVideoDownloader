import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  Divider,
  Flex,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Typography
} from 'antd';
import { ClearOutlined, ReloadOutlined } from '@ant-design/icons';
import type { AppSettings } from '@pkg/shared';
import { DEFAULT_SETTINGS } from '@pkg/shared';
import { apiGet, apiPost, apiPut } from '../api';

interface Props {
  toast: any;
  onSettingsChange?: (settings: AppSettings) => void;
}

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

function SettingItem({
                       label,
                       description,
                       children
                     }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 8 }}>
        <Typography.Text strong>{label}</Typography.Text>
        {description && (
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
            {description}
          </Typography.Text>
        )}
      </div>
      {children}
    </div>
  );
}

export function SettingsPanel({ toast, onSettingsChange }: Props) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const saveRef = useRef<((s: Partial<AppSettings>) => void) | null>(null);

  useEffect(() => {
    saveRef.current = debounce(async (newSettings: Partial<AppSettings>) => {
      try {
        const updated = await apiPut<AppSettings>('/api/settings', newSettings);
        setSettings((prev) => {
          const merged = { ...prev, ...updated };
          onSettingsChange?.(merged);
          return merged;
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
        const data = await apiGet<AppSettings>('/api/settings');
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
  };

  const handleCleanupJobs = async () => {
    setCleaning(true);
    try {
      const result = await apiPost<{ cleaned: number }>('/api/clear-all-jobs', {});
      toast.success(`已清理 ${result.cleaned} 个定时任务，请重启 Worker 服务`);
    } catch (e: any) {
      toast.error('清理失败: ' + e.message);
    } finally {
      setCleaning(false);
    }
  };

  const handleResetSettings = async () => {
    try {
      const updated = await apiPut<AppSettings>('/api/settings', DEFAULT_SETTINGS);
      setSettings(updated);
      onSettingsChange?.(updated);
      toast.success('已重置为默认设置');
    } catch (e: any) {
      toast.error('重置失败: ' + e.message);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large"/>
      </div>
    );
  }

  return (
    <Flex vertical gap={16} style={{ width: '100%' }}>
      <Card title="通用设置">
        <SettingItem
          label="轮询间隔"
          description="自动检查新视频的间隔时间"
        >
          <InputNumber
            value={settings.workerPollIntervalSeconds}
            onChange={(v) => updateField('workerPollIntervalSeconds', v || 60)}
            min={10}
            max={3600}
            step={10}
            style={{ width: 120 }}
          />
        </SettingItem>

        <SettingItem
          label="任务并发数"
          description="同时执行的任务数量"
        >
          <InputNumber
            value={settings.workerConcurrency}
            onChange={(v) => updateField('workerConcurrency', v || 2)}
            min={1}
            max={10}
            style={{ width: 120 }}
          />
        </SettingItem>

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

        <Divider style={{ margin: '12px 0' }}/>

        <SettingItem
          label="下载目录"
          description="相对于项目根目录的路径，或绝对路径"
        >
          <Input
            value={settings.downloadDir}
            onChange={(e) => updateField('downloadDir', e.target.value)}
            placeholder="./downloads"
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
          />
        </SettingItem>
      </Card>

      <Card title="防封设置">
        <SettingItem
          label="下载延迟"
          description="同一用户的视频之间的随机等待时间"
        >
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

        <Divider style={{ margin: '12px 0' }}/>

        <SettingItem
          label="用户间延迟"
          description="不同监控目标之间的随机等待时间"
        >
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

        <Divider style={{ margin: '12px 0' }}/>

        <SettingItem
          label="User-Agent 轮换"
          description="自动切换浏览器标识，降低被检测风险"
        >
          <Switch
            checked={settings.userAgentRotation}
            onChange={(v) => updateField('userAgentRotation', v)}
            checkedChildren="开"
            unCheckedChildren="关"
          />
        </SettingItem>

        <SettingItem
          label="检查间隔抖动"
          description="给轮询间隔添加随机波动"
        >
          <InputNumber
            value={settings.checkIntervalJitter}
            onChange={(v) => updateField('checkIntervalJitter', v || 10)}
            min={0}
            max={50}
            style={{ width: 120 }}
          />
        </SettingItem>

        <Divider style={{ margin: '12px 0' }}/>

        <SettingItem
          label="启用代理"
          description="使用代理池访问抖音"
        >
          <Switch
            checked={settings.proxyEnabled}
            onChange={(v) => updateField('proxyEnabled', v)}
            checkedChildren="开"
            unCheckedChildren="关"
          />
        </SettingItem>

        <SettingItem
          label="自动爬取代理"
          description="从公开代理源自动获取免费代理"
        >
          <Switch
            checked={settings.proxyAutoFetch}
            onChange={(v) => updateField('proxyAutoFetch', v)}
            checkedChildren="开"
            unCheckedChildren="关"
          />
        </SettingItem>

        <SettingItem label="代理爬取间隔">
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
      </Card>

      <Card title="维护操作">
        <SettingItem
          label="清理定时任务"
          description="如果有已删除目标的任务仍在执行，点击此按钮清理后重启 Worker"
        >
          <Button
            icon={<ClearOutlined/>}
            onClick={handleCleanupJobs}
            loading={cleaning}
            danger
          >
            清理所有定时任务
          </Button>
        </SettingItem>

        <SettingItem
          label="重置设置"
          description="将所有设置恢复为默认值"
        >
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
      </Card>
    </Flex>
  );
}