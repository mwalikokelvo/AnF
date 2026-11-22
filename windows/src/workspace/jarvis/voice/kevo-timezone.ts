/**
 * Offline "what time is it in Tokyo?" for Kevo.
 * Uses the browser's Intl with a small map of common places to IANA time zones.
 * Nothing is sent anywhere.
 */

import { bareRequest } from './kevo-fun';

const CITIES: Record<string, string> = {
  tokyo: 'Asia/Tokyo',
  london: 'Europe/London',
  'new york': 'America/New_York',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  sydney: 'Australia/Sydney',
  nairobi: 'Africa/Nairobi',
  mumbai: 'Asia/Kolkata',
  dubai: 'Asia/Dubai',
  'los angeles': 'America/Los_Angeles',
  chicago: 'America/Chicago',
  singapore: 'Asia/Singapore',
  hongkong: 'Asia/Hong_Kong',
  'hong kong': 'Asia/Hong_Kong',
  beijing: 'Asia/Shanghai',
  moscow: 'Europe/Moscow',
  cairo: 'Africa/Cairo',
  johannesburg: 'Africa/Johannesburg',
  rio: 'America/Sao_Paulo',
  'sao paulo': 'America/Sao_Paulo',
};

/**
 * "what time is it in Tokyo (now)", "time in London", "what's the time in Paris": the place asked about, known or not,
 * so a place Kevo has no time zone for is never answered with the time here.
 */
export function parseTimezoneRequest(lower: string): string | null {
  const said = bareRequest(lower);
  const m = /^(?:what(?:'s| is) the |whats the |what )?(?:current )?time(?: is it)?(?: right now| now)? in ([a-z ]+?)(?: right now| now)?$/.exec(said);
  return m ? m[1].trim().replace(/\s+/g, ' ') : null;
}

export function timeInPlace(place: string, now: Date = new Date()): string | null {
  const zone = CITIES[place.toLowerCase()];
  if (!zone) return null;
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    return `It is ${formatted} in ${placeName(place)}.`;
  } catch {
    return null;
  }
}

/** "new york" -> "New York". */
export function placeName(place: string): string {
  return place.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
