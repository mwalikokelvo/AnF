/**
 * Battery status for "battery", "battery level", "how much battery".
 * Uses Web Battery API when available (offline). Native bridge can replace later.
 */

export function isBatteryRequest(lower: string): boolean {
  const said = lower.replace(/[.!?]+$/, '').trim().replace(/^kevo[\s,]+/, '');
  return /^(?:(?:what(?:'s| is) )?(?:the |my )?battery(?: level| status)?|how much battery(?: is left)?|battery)$/.test(said);
}

export async function getBatteryStatus(): Promise<string> {
  if (typeof navigator === 'undefined' || !(navigator as any).getBattery) {
    return 'Battery status is not available in this environment.';
  }
  try {
    const bat = await (navigator as any).getBattery();
    const level = Math.round(bat.level * 100);
    const charging = bat.charging ? 'charging' : 'not charging';
    return `Battery is at ${level} percent and ${charging}.`;
  } catch {
    return 'Could not read battery status.';
  }
}
