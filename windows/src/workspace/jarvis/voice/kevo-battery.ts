/** Local battery status for Kevo. Uses the Battery Status API where available. */
export async function getBatteryStatus(): Promise<string> {
  if (!navigator.getBattery) {
    return "Battery status is not available on this device.";
  }
  try {
    const battery = await navigator.getBattery();
    const level = Math.round(battery.level * 100);
    const charging = battery.charging ? "charging" : "not charging";
    return `Battery is at ${level} percent and ${charging}.`;
  } catch {
    return "Could not read battery status.";
  }
}
