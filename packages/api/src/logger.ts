import { WsLogHub } from './wsLogHub';

let logHub: WsLogHub;

export function setLogHub(hub: WsLogHub) {
  logHub = hub;
}

export function log(level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) {
  if (logHub) {
    logHub.broadcast({ ts: new Date().toISOString(), level, msg, meta });
  }
  console.log(`[${level}] ${msg}`, meta ?? '');
}