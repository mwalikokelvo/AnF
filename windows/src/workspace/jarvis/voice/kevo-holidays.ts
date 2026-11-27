/**
 * Public holidays for Kevo using the free Nager.Date API.
 * https://date.nager.at/ — no key required for basic public holidays.
 */

import { onlineGet, type LookupFetch } from './kevo-online';

/** "is today a holiday", "public holidays in [country]", "holidays in US" */
export function isHolidayRequest(lower: string): { country?: string; year?: number } | null {
  const said = lower.replace(/^(kevo|hey kevo|jarvis)\s*/i, '').trim();
  const m = said.match(/^(?:is today a holiday(?: in (\w+))?|public holidays(?: in (\w+))?|holidays in (\w+))$/i);
  if (!m) return null;
  const country = (m[1] || m[2] || m[3] || 'US').toUpperCase();
  return { country, year: new Date().getFullYear() };
}

export async function publicHolidays(country = 'US', year?: number, fetchFn?: LookupFetch): Promise<string | null> {
  const y = year ?? new Date().getFullYear();
  const res = await onlineGet(
    `https://date.nager.at/api/v3/PublicHolidays/${y}/${country}`,
    'Nager.Date',
    fetchFn,
    undefined,
    1500
  );
  if (!res.ok) throw new Error(`Holidays service answered ${res.status}.`);
  const data = (await res.json()) as Array<{ date: string; localName: string; name: string }>;
  if (!Array.isArray(data) || !data.length) return `No public holidays found for ${country} in ${y}.`;
  const upcoming = data.filter(h => h.date >= new Date().toISOString().slice(0, 10)).slice(0, 3);
  const list = (upcoming.length ? upcoming : data.slice(0, 3))
    .map(h => `${h.localName || h.name} on ${h.date}`)
    .join(', ');
  return `Public holidays in ${country}: ${list}.`;
}
