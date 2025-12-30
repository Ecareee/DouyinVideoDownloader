import { WebSocketServer } from 'ws';

type LogEvent = {
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
  meta?: Record<string, unknown>;
};

export class WsLogHub {
  private wss: WebSocketServer;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
  }

  broadcast(evt: LogEvent) {
    const payload = JSON.stringify(evt);
    for (const client of this.wss.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  }
}