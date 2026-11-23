/** Kevo World Time: offline timezone lookup for common cities using Intl and a small offset map.
 * No external API required. Inspired by Siri/Alexa world clock features.
 */

const CITY_OFFSETS: Record<string, number> = {
  'london': 0,
  'paris': 1,
  'tokyo': 9,
  'new york': -5,
  'sydney': 10,
  'nairobi': 3,
  'dubai': 4,
  'singapore': 8,
  'los angeles': -8,
  'chicago': -6,
};

export function worldTime(city: string): string | null {
  const key = city.toLowerCase().trim();
  const offset = CITY_OFFSETS[key];
  if (offset === undefined) return null;
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const local = new Date(utc + offset * 3600000);
  return local.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatWorldTime(city: string, time: string): string {
  return `It is ${time} in ${city}.`;
}
