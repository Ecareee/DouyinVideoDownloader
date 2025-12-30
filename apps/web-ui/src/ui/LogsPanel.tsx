import React, { useRef } from 'react';
import { Button, Card, Empty, Flex, Tag, theme, Typography } from 'antd';
import { ClearOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLogContext } from './LogContext';

export function LogsPanel() {
  const { logs, connected, clearLogs, reconnect } = useLogContext();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const { token } = theme.useToken();

  const isDark = token.colorBgContainer === '#1f1f1f' || token.colorBgLayout === '#141414';

  const logBg = isDark ? '#1a1a2e' : '#fafafa';
  const timeColor = isDark ? '#7a7aaa' : '#666';
  const msgColor = isDark ? '#e0e0e8' : '#333';
  const metaColor = isDark ? '#7ec878' : '#0a8f0a';
  const emptyColor = isDark ? '#8888aa' : '#999';

  const levelColors: Record<string, string> = {
    info: 'blue',
    warn: 'orange',
    error: 'red'
  };

  return (
    <Flex vertical gap={16} style={{ width: '100%', height: '100%' }}>
      <Card size="small">
        <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
          <Flex gap={8} align="center">
            <Typography.Text type="secondary">实时日志流</Typography.Text>
            <Tag color={connected ? 'success' : 'error'}>
              {connected ? '已连接' : '未连接'}
            </Tag>
          </Flex>
          <Flex gap={8}>
            <Button
              icon={<ReloadOutlined/>}
              onClick={reconnect}
              disabled={connected}
              size="small"
            >
              重连
            </Button>
            <Button icon={<ClearOutlined/>} onClick={clearLogs} size="small">
              清空
            </Button>
          </Flex>
        </Flex>
      </Card>

      <Card
        style={{
          flex: 1,
          minHeight: 400,
          overflow: 'hidden'
        }}
        styles={{
          body: {
            padding: 0,
            height: '100%',
            overflow: 'auto',
            background: logBg
          }
        }}
      >
        <div
          ref={logContainerRef}
          style={{
            padding: 12,
            fontSize: 13,
            lineHeight: 1.6
          }}
        >
          {logs.length === 0 ? (
            <Empty
              description={
                <Typography.Text style={{ color: emptyColor }}>
                  暂无日志，等待 API 或 Worker 服务产生日志...
                </Typography.Text>
              }
              style={{ marginTop: 100 }}
            />
          ) : (
            logs.map((l, idx) => (
              <div key={idx} style={{ marginBottom: 4, wordBreak: 'break-all' }}>
                <span style={{ color: timeColor }}>
                  [{new Date(l.ts).toLocaleTimeString('zh-CN')}]
                </span>{' '}
                <Tag
                  color={levelColors[l.level]}
                  style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', verticalAlign: 'middle' }}
                >
                  {l.level.toUpperCase()}
                </Tag>{' '}
                <span style={{ color: msgColor }}>{l.msg}</span>
                {l.meta && (
                  <span style={{ color: metaColor, marginLeft: 8 }}>
                    {JSON.stringify(l.meta)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </Flex>
  );
}