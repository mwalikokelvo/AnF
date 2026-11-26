/**
 * Public holidays for Kevo using the free Nager.Date API (https://date.nager.at).
 * Country defaults to US; user can say "holidays in Kenya".
 */

import { bareRequest } from './kevo-fun';
import { onlineGet, type LookupFetch } from './kevo-online';

const COUNTRIES: Record<string, string> = {
  us: 'US', usa: 'US', 'united states': 'US',
  uk: 'GB', britain: 'GB', 'united kingdom': 'GB',
  kenya: 'KE', canada: 'CA', australia: 'AU',
  germany: 'DE', france: 'FR', india: 'IN',
  nigeria: 'NG', southafrica: 'ZA', 'south africa': 'ZA',
};

export function parseHolidayRequest(lower: string): { country: string; year?: number } | null {
  const said = bareRequest(lower);
  const m = /^(?:(?:is today a holiday|what holidays|holidays|public holidays)(?: (?:in|for) ([a-z ]+))?)$/.exec(said);
  if (!m) return null;
  const name = (m[1] || 'us').toLowerCase().trim();
  const code = COUNTRIES[name] || 'US';
  return { country: code };
}

interface Holiday {
  date: string;
  localName: string;
  name: string;
  global: boolean;
}

export async function upcomingHolidays(country = 'US', fetchFn?: LookupFetch): Promise<string | null> {
  const year = new Date().getFullYear();
  const res = await onlineGet(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`,
    'Nager.Date',
    fetchFn,
    undefined,
    1500
  );
  if (!res.ok) throw new Error(`the holiday service answered ${res.status}.`);
  const holidays = (await res.json()) as Holiday[];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = holidays
    .filter(h => h.date >= today)
    .slice(0, 4);
  if (!upcoming.length) return 'No more public holidays this year.';
  const spoken = upcoming
    .map(h => `${h.localName || h.name} on ${h.date}`)
    .join('. ');
  return `Upcoming holidays in ${country}: ${spoken}.`;
}
