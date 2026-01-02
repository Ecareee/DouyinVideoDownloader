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
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import { getNextAlignedTime, type SourceType } from '@pkg/shared';
import { settingsApi, type Target, targetsApi } from '../api';

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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('已复制到剪贴板');
    } catch {
      toast.error('复制失败');
    }
  };

  const CopyableTooltipContent = ({ text }: { text: string }) => (
    <Flex align="flex-start" gap={8} style={{ maxWidth: 300 }}>
      <span style={{ wordBreak: 'break-all', flex: 1 }}>{text}</span>
      <Button
        type="text"
        size="small"
        icon={<CopyOutlined/>}
        onClick={(e) => {
          e.stopPropagation();
          copyToClipboard(text);
        }}
        style={{
          color: 'rgba(255,255,255,0.85)',
          minWidth: 24,
          padding: '0 4px',
          height: 22
        }}
      />
    </Flex>
  );

  async function refresh() {
    setLoading(true);
    try {
      const data = await targetsApi.list();
      setTargets(data);
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
    form.setFieldsValue({ sourceType: 'douyin', headless: true });
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
        await targetsApi.update(editingTarget.id, payload);
        toast.success('目标已更新');
      } else {
        await targetsApi.create(payload);
        const settings = await settingsApi.get();
        const intervalSeconds = settings.workerPollIntervalSeconds;
        const intervalMs = intervalSeconds * 1000;
        const nextTime = getNextAlignedTime(intervalMs);

        const timeStr = nextTime.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        toast.success(`目标已创建，将在 ${timeStr} 首次执行，之后每 ${intervalSeconds} 秒执行一次`);
      }

      setOpen(false);
      form.resetFields();
      await refresh();
    } catch (e: any) {
      toast.error(e.message || '操作失败');
    }
  }

  async function handleDelete(id: string) {
    try {
      await targetsApi.delete(id);
      toast.success('目标已删除');
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleTrigger(id: string) {
    try {
      await targetsApi.trigger(id);
      toast.success('任务已触发');
    } catch (e: any) {
      toast.error(e.message);
    }
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
      width: 100,
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
      width: 250,
      render: (config: string, record: Target) => {
        const cfg = parseConfig(config);
        if (record.sourceType === 'douyin') {
          return (
            <Flex vertical gap={2}>
              <Tooltip
                title={<CopyableTooltipContent text={cfg.secUserId || ''}/>}
                mouseLeaveDelay={0.3}
              >
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: 12, cursor: 'pointer' }}
                  ellipsis
                >
                  用户 ID：{cfg.secUserId}
                </Typography.Text>
              </Tooltip>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Cookie：{cfg.cookie ? '已配置' : '未配置'}
              </Typography.Text>
            </Flex>
          );
        }
        return (
          <Tooltip
            title={<CopyableTooltipContent text={cfg.url || ''}/>}
            mouseLeaveDelay={0.3}
          >
            <Typography.Text
              type="secondary"
              style={{ fontSize: 12, maxWidth: 180, display: 'block', cursor: 'pointer' }}
              ellipsis
            >
              {cfg.url}
            </Typography.Text>
          </Tooltip>
        );
      }
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      sorter: (a: Target, b: Target) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: 'descend' as const,
      render: (date: string) => new Date(date).toLocaleString('zh-CN')
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      sorter: (a: Target, b: Target) =>
        new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
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
            onConfirm={() => handleDelete(record.id)}
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
            <Input placeholder="请输入名称"/>
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
                <Input placeholder="请输入用户 ID"/>
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
                <Switch/>
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