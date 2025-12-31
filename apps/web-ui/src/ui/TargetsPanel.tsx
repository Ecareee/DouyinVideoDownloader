import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import type { SourceType, Target } from '@pkg/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '../api';

interface Props {
  toast: any;
}

export function TargetsPanel({ toast }: Props) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [open, setOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<Target | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [sourceType, setSourceType] = useState<SourceType>('douyin');

  async function refresh() {
    setLoading(true);
    try {
      const t = await apiGet<Target[]>('/api/targets');
      setTargets(t);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const openCreateModal = () => {
    setEditingTarget(null);
    form.resetFields();
    form.setFieldsValue({ sourceType: 'douyin', maxPages: 3, headless: true });
    setSourceType('douyin');
    setOpen(true);
  };

  const openEditModal = (target: Target) => {
    setEditingTarget(target);
    const config = JSON.parse(target.sourceConfig || '{}');
    form.setFieldsValue({
      name: target.name,
      sourceType: target.sourceType,
      ...config
    });
    setSourceType(target.sourceType as SourceType);
    setOpen(true);
  };

  async function handleSubmit(values: any) {
    try {
      const { name, sourceType, ...configFields } = values;

      let sourceConfig: any = {};
      if (sourceType === 'douyin') {
        sourceConfig = {
          secUserId: configFields.secUserId,
          cookie: configFields.cookie,
          headless: configFields.headless !== false
        };
      } else if (sourceType === 'http_json') {
        sourceConfig = { url: configFields.url };
      }

      const payload = {
        name,
        sourceType,
        sourceConfig: JSON.stringify(sourceConfig)
      };

      if (editingTarget) {
        await apiPut(`/api/targets/${editingTarget.id}`, payload);
        toast.success('目标已更新');
      } else {
        await apiPost<Target>('/api/targets', payload);
        const settings = await apiGet<{ workerPollIntervalSeconds: number }>('/api/settings');
        const intervalSec = settings.workerPollIntervalSeconds || 60;

        const now = new Date();
        const nextMinute = new Date(now);
        nextMinute.setSeconds(0, 0);
        nextMinute.setMinutes(nextMinute.getMinutes() + 1);
        const timeStr = nextMinute.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        toast.success(`目标已创建，将在 ${timeStr} 首次执行，之后每 ${intervalSec} 秒执行一次`);
      }

      setOpen(false);
      form.resetFields();
      await refresh();
    } catch (e: any) {
      toast.error(e.message || '操作失败');
    }
  }

  async function del(id: string) {
    await apiDelete(`/api/targets/${id}`);
    toast.success('目标已删除');
    await refresh();
  }

  async function trigger(id: string) {
    await apiPost(`/api/targets/${id}/trigger`, {});
    toast.success('任务已触发');
  }

  const parseConfig = (config: string) => {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      sorter: (a: Target, b: Target) => a.name.localeCompare(b.name),
      render: (name: string) => <Typography.Text strong>{name}</Typography.Text>
    },
    {
      title: '类型',
      dataIndex: 'sourceType',
      key: 'sourceType',
      width: 100,
      sorter: (a: Target, b: Target) => a.sourceType.localeCompare(b.sourceType),
      filters: [
        { text: '抖音', value: 'douyin' },
        { text: 'HTTP JSON', value: 'http_json' }
      ],
      onFilter: (value: any, record: Target) => record.sourceType === value,
      render: (type: string) => {
        const colorMap: Record<string, string> = {
          douyin: 'magenta',
          http_json: 'blue'
        };
        const labelMap: Record<string, string> = {
          douyin: '抖音',
          http_json: 'HTTP JSON'
        };
        return <Tag color={colorMap[type] || 'default'}>{labelMap[type] || type}</Tag>;
      }
    },
    {
      title: '配置信息',
      dataIndex: 'sourceConfig',
      key: 'sourceConfig',
      width: 280,
      render: (config: string, record: Target) => {
        const cfg = parseConfig(config);
        if (record.sourceType === 'douyin') {
          return (
            <Flex vertical gap={0}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }} copyable={{ text: cfg.secUserId }}>
                用户ID：{cfg.secUserId}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Cookie: {cfg.cookie ? '已配置' : '未配置'}
              </Typography.Text>
            </Flex>
          );
        }
        return (
          <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {cfg.url}
          </Typography.Text>
        );
      }
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      sorter: (a: Target, b: Target) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      render: (date: string) => new Date(date).toLocaleString('zh-CN')
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      sorter: (a: Target, b: Target) =>
        new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      defaultSortOrder: 'descend' as const,
      render: (date: string) => new Date(date).toLocaleString('zh-CN')
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 120,
      render: (_: any, record: Target) => (
        <Flex gap={4}>
          <Tooltip title="立即执行">
            <Button
              type="primary"
              icon={<PlayCircleOutlined/>}
              size="small"
              onClick={() => trigger(record.id)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button icon={<EditOutlined/>} size="small" onClick={() => openEditModal(record)}/>
          </Tooltip>
          <Popconfirm
            title="确定删除此目标？"
            description="相关的视频记录也会被删除"
            onConfirm={() => del(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button danger icon={<DeleteOutlined/>} size="small"/>
            </Tooltip>
          </Popconfirm>
        </Flex>
      )
    }
  ];

  return (
    <Flex vertical gap={16} style={{ width: '100%' }}>
      <Card>
        <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
          <Typography.Text type="secondary">
            添加需要监控的抖音用户，支持定时抓取和自动下载视频。
          </Typography.Text>
          <Button type="primary" icon={<PlusOutlined/>} onClick={openCreateModal}>
            新建目标
          </Button>
        </Flex>
      </Card>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={targets}
        columns={columns}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 900 }}
        rowClassName={() => 'hoverable-row'}
        size="middle"
        showSorterTooltip={false}
      />

      <Modal
        title={editingTarget ? '编辑目标' : '新建监控目标'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText={editingTarget ? '保存' : '创建'}
        cancelText="取消"
        width={600}
        forceRender
        destroyOnHidden={false}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input/>
          </Form.Item>

          <Form.Item name="sourceType" label="数据源类型" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '抖音用户主页', value: 'douyin' },
                { label: 'HTTP JSON 接口', value: 'http_json' }
              ]}
              onChange={(v) => setSourceType(v)}
            />
          </Form.Item>

          {sourceType === 'douyin' && (
            <>
              <Form.Item
                name="secUserId"
                label={
                  <Flex gap={4} align="center">
                    用户 ID
                    <Tooltip
                      title="在抖音用户主页 URL 中，如 https://www.douyin.com/user/MS4wLjAB... 后面的部分就是用户 ID">
                      <QuestionCircleOutlined/>
                    </Tooltip>
                  </Flex>
                }
                rules={[{ required: true, message: '请输入用户 ID' }]}
              >
                <Input/>
              </Form.Item>

              <Form.Item
                name="cookie"
                label={
                  <Flex gap={4} align="center">
                    Cookie
                    <Tooltip title="登录抖音后，从浏览器开发者工具复制 Cookie">
                      <QuestionCircleOutlined/>
                    </Tooltip>
                  </Flex>
                }
              >
                <Input.TextArea
                  rows={4}
                  placeholder="留空则无法获取最新视频"
                />
              </Form.Item>

              <Form.Item
                name="headless"
                label={
                  <Flex gap={4} align="center">
                    无头模式
                    <Tooltip title="关闭后可以看到浏览器窗口，用于调试">
                      <QuestionCircleOutlined/>
                    </Tooltip>
                  </Flex>
                }
                valuePropName="checked"
              >
                <Switch checkedChildren="开" unCheckedChildren="关"/>
              </Form.Item>
            </>
          )}

          {sourceType === 'http_json' && (
            <Form.Item
              name="url"
              label="JSON 接口 URL"
              rules={[{ required: true, type: 'url', message: '请输入有效的 URL' }]}
            >
              <Input placeholder="https://your-domain/feed.json"/>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Flex>
  );
}