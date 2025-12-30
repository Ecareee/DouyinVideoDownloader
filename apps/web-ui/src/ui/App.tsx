import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Badge, ConfigProvider, Layout, Menu, message, theme, Typography } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  AimOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { TargetsPanel } from './TargetsPanel';
import { LogsPanel } from './LogsPanel';
import { JobRunsPanel } from './JobRunsPanel';
import { SettingsPanel } from './SettingsPanel';
import { DownloadsPanel } from './DownloadsPanel';
import { LogProvider, useLogContext } from './LogContext';
import type { AppSettings } from '@pkg/shared';
import { DEFAULT_SETTINGS } from '@pkg/shared';
import { apiGet } from '../api';

const { Header, Sider, Content } = Layout;

const darkThemeTokens = {
  colorPrimary: '#1677ff',
  colorBgContainer: '#1f1f1f',
  colorBgElevated: '#2a2a2a',
  colorBgLayout: '#141414',
  colorBgSpotlight: '#333333',
  colorBorder: '#424242',
  colorBorderSecondary: '#353535',
  colorText: '#e8e8e8',
  colorTextSecondary: '#a8a8a8',
  colorTextTertiary: '#7a7a7a',
  borderRadius: 6
};

const lightThemeTokens = {
  colorPrimary: '#1677ff',
  borderRadius: 6
};

function AppLayout() {
  const [msgApi, contextHolder] = message.useMessage();
  const [collapsed, setCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const navigate = useNavigate();
  const location = useLocation();
  const { connected } = useLogContext();

  // 加载设置
  useEffect(() => {
    apiGet<AppSettings>('/api/settings')
      .then(setSettings)
      .catch(() => {
      });
  }, []);

  // 根据设置决定主题
  useEffect(() => {
    const updateTheme = () => {
      if (settings.theme === 'system') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        setIsDarkMode(mediaQuery.matches);
      } else {
        setIsDarkMode(settings.theme === 'dark');
      }
    };
    updateTheme();

    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [settings.theme]);

  // 响应式处理
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setCollapsed(true);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 页面标题映射
  const pageTitles: Record<string, string> = {
    '/targets': '监控目标',
    '/jobs': '任务记录',
    '/downloads': '下载管理',
    '/logs': '实时日志',
    '/settings': '系统设置'
  };

  const menuItems = [
    { key: '/targets', icon: <AimOutlined/>, label: '监控目标' },
    { key: '/jobs', icon: <HistoryOutlined/>, label: '任务记录' },
    { key: '/downloads', icon: <FolderOpenOutlined/>, label: '下载管理' },
    {
      key: '/logs',
      icon: <FileTextOutlined/>,
      label: (
        <span>
          实时日志
          <Badge
            status={connected ? 'success' : 'error'}
            style={{ marginLeft: 8 }}
          />
        </span>
      )
    },
    { key: '/settings', icon: <SettingOutlined/>, label: '系统设置' }
  ];

  const currentKey = location.pathname === '/' ? '/targets' : location.pathname;

  const handleMenuClick = useCallback(
    ({ key }: { key: string }) => {
      navigate(key);
      if (isMobile) setCollapsed(true);
    },
    [navigate, isMobile]
  );

  const siderWidth = collapsed ? 80 : 200;

  const bgColor = isDarkMode ? '#141414' : '#f5f5f5';
  const headerBg = isDarkMode ? '#1f1f1f' : '#fff';
  const headerBorder = isDarkMode ? '#333' : '#f0f0f0';
  const siderBg = isDarkMode ? '#1f1f1f' : '#fff';

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: isDarkMode ? darkThemeTokens : lightThemeTokens
      }}
    >
      <Layout style={{ minHeight: '100vh', background: bgColor }}>
        {contextHolder}

        {/* 移动端遮罩 */}
        {isMobile && !collapsed && (
          <div
            onClick={() => setCollapsed(true)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 99
            }}
          />
        )}

        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          width={200}
          collapsedWidth={isMobile ? 0 : 80}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            background: siderBg,
            borderRight: `1px solid ${headerBorder}`
          }}
        >
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: `1px solid ${headerBorder}`
            }}
          >
            <Typography.Title
              level={collapsed ? 5 : 4}
              style={{ margin: 0, whiteSpace: 'nowrap' }}
            >
              {collapsed && !isMobile ? '抖' : '抖音监控'}
            </Typography.Title>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[currentKey]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ border: 'none', background: 'transparent' }}
          />
        </Sider>

        <Layout
          style={{
            marginLeft: isMobile ? 0 : siderWidth,
            transition: 'margin-left 0.2s',
            minWidth: 0,
            background: bgColor
          }}
        >
          <Header
            style={{
              padding: '0 16px',
              background: headerBg,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              borderBottom: `1px solid ${headerBorder}`,
              position: 'sticky',
              top: 0,
              zIndex: 10
            }}
          >
            {/* 折叠按钮 */}
            <span
              onClick={() => setCollapsed(!collapsed)}
              style={{ cursor: 'pointer', fontSize: 18 }}
            >
              {collapsed ? <MenuUnfoldOutlined/> : <MenuFoldOutlined/>}
            </span>
            <Typography.Title level={4} style={{ margin: 0, flex: 1 }}>
              {pageTitles[currentKey] || '监控目标'}
            </Typography.Title>
          </Header>

          <Content
            style={{
              margin: isMobile ? 8 : 16,
              minHeight: 280,
              overflow: 'auto'
            }}
          >
            <Routes>
              <Route path="/" element={<TargetsPanel toast={msgApi}/>}/>
              <Route path="/targets" element={<TargetsPanel toast={msgApi}/>}/>
              <Route path="/jobs" element={<JobRunsPanel/>}/>
              <Route path="/downloads" element={<DownloadsPanel/>}/>
              <Route path="/logs" element={<LogsPanel/>}/>
              <Route
                path="/settings"
                element={<SettingsPanel toast={msgApi} onSettingsChange={setSettings}/>}
              />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <LogProvider>
        <AppLayout/>
      </LogProvider>
    </BrowserRouter>
  );
}