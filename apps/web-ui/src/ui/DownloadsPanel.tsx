import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Flex, Row, Statistic, Table, Tag, Typography } from 'antd';
import { DownloadOutlined, FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons';
import { type FileInfo, filesApi, type FilesResponse } from '../api';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function DownloadsPanel() {
  const [data, setData] = useState<FilesResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const resp = await filesApi.list();
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
      width: 200,
      ellipsis: true,
      sorter: (a: FileInfo, b: FileInfo) => a.name.localeCompare(b.name),
      defaultSortOrder: 'descend' as const,
      render: (name: string) => (
        <Typography.Text ellipsis={{ tooltip: name }} style={{ maxWidth: 200 }}>
          {name}
        </Typography.Text>
      )
    },
    {
      title: '作者',
      dataIndex: 'targetId',
      key: 'targetId',
      width: 200,
      ellipsis: true,
      sorter: (a: FileInfo, b: FileInfo) => (a.targetId || '').localeCompare(b.targetId || ''),
      render: (id: string) => (
        <Typography.Text ellipsis={{ tooltip: id }}>{id}</Typography.Text>
      )
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      sorter: (a: FileInfo, b: FileInfo) => a.size - b.size,
      render: (size: number) => <Tag>{formatFileSize(size)}</Tag>
    },
    {
      title: '下载时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      sorter: (a: FileInfo, b: FileInfo) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      render: (date: string) => (
        <span style={{ whiteSpace: 'nowrap' }}>
        {new Date(date).toLocaleString('zh-CN')}
      </span>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      fixed: 'right' as const,
      render: (_: any, record: FileInfo) => (
        <Button
          type="link"
          icon={<DownloadOutlined/>}
          href={filesApi.getDownloadUrl(record.path)}
          target="_blank"
          size="small"
        >
          下载
        </Button>
      )
    }
  ];

  return (
    <Flex vertical gap={16} style={{ width: '100%', overflowX: 'hidden' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8} style={{ minWidth: 0 }}>
          <Card size="small" style={{ width: '100%', height: '100%' }}>
            <Statistic
              title="已下载文件"
              value={data?.files?.length || 0}
              suffix="个"
              prefix={<FolderOpenOutlined/>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} style={{ minWidth: 0 }}>
          <Card size="small" style={{ width: '100%', height: '100%' }}>
            <Statistic
              title="总大小"
              value={formatFileSize(data?.totalSize || 0)}
              prefix={<DownloadOutlined/>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} style={{ minWidth: 0 }}>
          <Card size="small" style={{ width: '100%', height: '100%' }}>
            <Statistic
              title="存储路径"
              value={data?.downloadDir || './downloads'}
              formatter={(value) => (
                <div style={{ wordBreak: 'break-all', whiteSpace: 'normal', fontSize: 14, width: '100%' }}>
                  {value}
                </div>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={<span style={{ paddingLeft: 8 }}>已下载文件</span>}
        extra={
          <Button icon={<ReloadOutlined/>} onClick={refresh} loading={loading} size="small">
            刷新
          </Button>
        }
        size="small"
        styles={{ header: { padding: '12px 16px' } }}
      >
        <Table
          rowKey="path"
          loading={loading}
          dataSource={data?.files || []}
          columns={columns}
          pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 750 }}
          locale={{ emptyText: '暂无下载的文件' }}
          rowClassName={() => 'hoverable-row'}
          size="small"
          showSorterTooltip={false}
        />
      </Card>
    </Flex>
  );
}