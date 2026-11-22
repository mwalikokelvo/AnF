/**
 * Today in history for Kevo, from Wikipedia's free On This Day feed (https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/MM/DD).
 * Inspired by OVOS days-in-history skill. Only the date is sent; nothing private.
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export interface HistoryEvent {
  year: number;
  text: string;
}

/** One or two events from today (or a given month/day). */
export async function todayInHistory(month?: number, day?: number, fetchFn?: LookupFetch): Promise<string | null> {
  const now = new Date();
  const m = month ?? now.getMonth() + 1;
  const d = day ?? now.getDate();
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const res = await onlineGet(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`, 'Wikipedia', fetchFn);
  if (!res.ok) throw new Error(`Wikipedia answered ${res.status}.`);
  const data = (await res.json()) as { events?: Array<{ year?: number; text?: string }> };
  const events = (data.events || []).filter((e) => e.year && e.text).slice(0, 2);
  if (!events.length) return null;
  const spoken = events.map((e) => `In ${e.year}, ${e.text!.replace(/\s+/g, ' ').trim()}.`).join(' ');
  return spoken.length > 500 ? spoken.slice(0, 480) + '…' : spoken;
}
