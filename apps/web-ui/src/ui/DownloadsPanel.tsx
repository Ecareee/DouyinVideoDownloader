import React, { useEffect, useState } from 'react';
import { Button, Card, Flex, Statistic, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons';
import { apiGet } from '../api';

interface DownloadFile {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  targetId?: string;
}

interface DownloadsResponse {
  files: DownloadFile[];
  totalSize: number;
  downloadDir: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function DownloadsPanel() {
  const [data, setData] = useState<DownloadsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const resp = await apiGet<DownloadsResponse>('/api/downloads');
      setData(resp);
    } catch (e) {
      console.error('获取下载列表失败:', e);
      setData({ files: [], totalSize: 0, downloadDir: './downloads' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      width: 300,
      sorter: (a: DownloadFile, b: DownloadFile) => a.name.localeCompare(b.name),
      render: (name: string) => (
        <Typography.Text style={{ wordBreak: 'break-all' }}>
          {name}
        </Typography.Text>
      )
    },
    {
      title: '作者',
      dataIndex: 'targetId',
      key: 'targetId',
      width: 300,
      sorter: (a: DownloadFile, b: DownloadFile) => (a.targetId || '').localeCompare(b.targetId || ''),
      render: (id: string) => (
        <Typography.Text>{id}</Typography.Text>
      )
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      sorter: (a: DownloadFile, b: DownloadFile) => a.size - b.size,
      render: (size: number) => <Tag>{formatFileSize(size)}</Tag>
    },
    {
      title: '下载时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      sorter: (a: DownloadFile, b: DownloadFile) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: 'descend' as const,
      render: (date: string) => new Date(date).toLocaleString('zh-CN')
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_: any, record: DownloadFile) => (
        <Button
          type="link"
          icon={<DownloadOutlined/>}
          href={`/api/download-file?path=${encodeURIComponent(record.path)}`}
          target="_blank"
          size="small"
        >
          下载
        </Button>
      )
    }
  ];

  return (
    <Flex vertical gap={16} style={{ width: '100%' }}>
      <Flex gap={16} wrap="wrap">
        <Card size="small" style={{ flex: '1 1 200px', minWidth: 150 }}>
          <Statistic
            title="已下载文件"
            value={data?.files?.length || 0}
            suffix="个"
            prefix={<FolderOpenOutlined/>}
          />
        </Card>
        <Card size="small" style={{ flex: '1 1 200px', minWidth: 150 }}>
          <Statistic
            title="总大小"
            value={formatFileSize(data?.totalSize || 0)}
            prefix={<DownloadOutlined/>}
          />
        </Card>
        <Card size="small" style={{ flex: '1 1 200px', minWidth: 150 }}>
          <Statistic
            title="存储路径"
            value={data?.downloadDir || './downloads'}
            styles={{ content: { fontSize: 14, wordBreak: 'break-all' } }}
          />
        </Card>
      </Flex>

      <Card
        title={<span style={{ paddingLeft: 8 }}>已下载文件</span>}
        extra={
          <Button icon={<ReloadOutlined/>} onClick={refresh} loading={loading} size="small">
            刷新
          </Button>
        }
        size="small"
      >
        <Table
          rowKey="path"
          loading={loading}
          dataSource={data?.files || []}
          columns={columns}
          pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          locale={{ emptyText: '暂无下载的文件' }}
          rowClassName={() => 'hoverable-row'}
          size="small"
          showSorterTooltip={false}
        />
      </Card>
    </Flex>
  );
}