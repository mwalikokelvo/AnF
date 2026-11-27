/**
 * Kevo System: basic device status (battery, online) matching assistant "how is my device" behavior.
 * Uses browser APIs where available; graceful offline.
 */
export interface SystemStatus {
  battery?: string;
  online: boolean;
  summary: string;
}

export async function getSystemStatus(): Promise<SystemStatus> {
  let battery = 'unknown';
  if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
    try {
      const bat = await (navigator as any).getBattery();
      battery = `${Math.round(bat.level * 100)}%${bat.charging ? ', charging' : ''}`;
    } catch { /* ignore */ }
  }
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const summary = `Device is ${online ? 'online' : 'offline'}${battery !== 'unknown' ? `, battery ${battery}` : ''}.`;
  return { battery: battery !== 'unknown' ? battery : undefined, online, summary };
}
