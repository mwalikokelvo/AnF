/**
 * Local battery status for Kevo using the Battery Status API.
 * "how's the battery", "battery level", "how much battery".
 * Pure local; no network. Falls back gracefully if API unavailable.
 */

export function isBatteryRequest(lower: string): boolean {
  return /^(?:how'?s the battery|battery(?: level| status)?|how much battery|battery left|what'?s my battery)$/.test(lower.trim());
}

export async function batteryStatus(): Promise<string> {
  if (!('getBattery' in navigator)) {
    return 'Battery status is not available in this environment.';
  }
  try {
    const battery = await (navigator as any).getBattery();
    const level = Math.round(battery.level * 100);
    const charging = battery.charging ? 'charging' : 'not charging';
    const time = battery.chargingTime === Infinity ? '' : ` About ${Math.round(battery.chargingTime / 60)} minutes to full.`;
    return `Battery is at ${level} percent and ${charging}.${time}`;
  } catch {
    return 'I could not read the battery status.';
  }
}
