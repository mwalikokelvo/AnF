/** Days until a given date for Kevo. */
export function daysUntil(dateStr: string): string {
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return "Please give a valid date, like 2026-12-25.";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return "That is today.";
  if (diff > 0) return `${diff} day${diff === 1 ? "" : "s"} until ${dateStr}.`;
  return `${-diff} day${-diff === 1 ? "" : "s"} ago.`;
}
