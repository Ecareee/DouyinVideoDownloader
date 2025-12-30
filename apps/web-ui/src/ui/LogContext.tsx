import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type LogEvt = { ts: string; level: 'info' | 'warn' | 'error'; msg: string; meta?: any };

interface LogContextValue {
  logs: LogEvt[];
  connected: boolean;
  clearLogs: () => void;
  reconnect: () => void;
}

const LogContext = createContext<LogContextValue>({
  logs: [],
  connected: false,
  clearLogs: () => {
  },
  reconnect: () => {
  }
});

export function useLogContext() {
  return useContext(LogContext);
}

export function LogProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<LogEvt[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/logs`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
        setLogs((prev) => [
          { ts: new Date().toISOString(), level: 'info' as const, msg: '已连接到日志服务' },
          ...prev
        ].slice(0, 1000));
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;
        // 3 秒后重连
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        // onerror 后会触发 onclose
      };

      ws.onmessage = (ev) => {
        if (!mountedRef.current) return;
        try {
          const obj = JSON.parse(ev.data);
          setLogs((prev) => [obj, ...prev].slice(0, 1000));
        } catch {
        }
      };
    } catch {
      setConnected(false);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // 延迟 500ms 连接，等待 API 启动
    const initTimeout = setTimeout(connect, 500);

    return () => {
      mountedRef.current = false;
      clearTimeout(initTimeout);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    connect();
  }, [connect]);

  return (
    <LogContext.Provider value={{ logs, connected, clearLogs, reconnect }}>
      {children}
    </LogContext.Provider>
  );
}