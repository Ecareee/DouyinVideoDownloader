import React, { useEffect, useState } from 'react';
import { Card, Flex, Table, Tag, Typography } from 'antd';
import type { JobRun } from '@pkg/shared';
import { apiGet } from '../api';

interface JobRunWithTarget extends JobRun {
  target?: { name: string };
}

export function JobRunsPanel() {
  const [runs, setRuns] = useState<JobRunWithTarget[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const r = await apiGet<JobRunWithTarget[]>('/api/job-runs');
      setRuns(r);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  const statusMap: Record<string, { color: string; text: string }> = {
    queued: { color: 'default', text: '排队中' },
    running: { color: 'processing', text: '执行中' },
    succeeded: { color: 'success', text: '成功' },
    failed: { color: 'error', text: '失败' }
  };

  const columns = [
    {
      title: '目标',
      key: 'target',
      width: 120,
      sorter: (a: JobRunWithTarget, b: JobRunWithTarget) =>
        (a.target?.name || '').localeCompare(b.target?.name || ''),
      render: (_: any, record: JobRunWithTarget) => (
        <Typography.Text>{record.target?.name || record.targetId.slice(0, 8)}</Typography.Text>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      filters: [
        { text: '排队中', value: 'queued' },
        { text: '执行中', value: 'running' },
        { text: '成功', value: 'succeeded' },
        { text: '失败', value: 'failed' }
      ],
      onFilter: (value: any, record: JobRunWithTarget) => record.status === value,
      render: (status: string) => {
        const info = statusMap[status] || { color: 'default', text: status };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 170,
      sorter: (a: JobRunWithTarget, b: JobRunWithTarget) =>
        new Date(a.startedAt || 0).getTime() - new Date(b.startedAt || 0).getTime(),
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-CN') : '-')
    },
    {
      title: '结束时间',
      dataIndex: 'finishedAt',
      key: 'finishedAt',
      width: 170,
      sorter: (a: JobRunWithTarget, b: JobRunWithTarget) =>
        new Date(a.finishedAt || 0).getTime() - new Date(b.finishedAt || 0).getTime(),
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-CN') : '-')
    },
    {
      title: '错误信息',
      dataIndex: 'error',
      key: 'error',
      width: 200,
      render: (error: string) =>
        error ? (
          <Typography.Text type="danger" ellipsis style={{ maxWidth: 200 }}>
            {error}
          </Typography.Text>
        ) : (
          '-'
        )
    }
  ];

  return (
    <Flex vertical gap={16} style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Text type="secondary">
          显示最近的任务执行记录，每 3 秒自动刷新。
        </Typography.Text>
      </Card>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={runs}
        columns={columns}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 750 }}
        rowClassName={() => 'hoverable-row'}
        size="middle"
        showSorterTooltip={false}
      />
    </Flex>
  );
}