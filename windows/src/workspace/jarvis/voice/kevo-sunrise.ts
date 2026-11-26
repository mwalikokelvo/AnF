/**
 * Sunrise and sunset for a place via Open-Meteo (free, no key).
 * "When is sunrise in London?"
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export async function fetchSunTimes(place: string, fetchFn?: LookupFetch): Promise<{ sunrise: string; sunset: string; place: string } | null> {
  const geo = await onlineGet(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`,
    'geocoding',
    fetchFn,
  );
  if (!geo.ok) return null;
  const geoData = (await geo.json()) as { results?: { latitude: number; longitude: number; name: string }[] };
  const loc = geoData.results?.[0];
  if (!loc) return null;

  const sun = await onlineGet(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=sunrise,sunset&timezone=auto&forecast_days=1`,
    'sun times',
    fetchFn,
  );
  if (!sun.ok) return null;
  const data = (await sun.json()) as { daily?: { sunrise?: string[]; sunset?: string[] } };
  const rise = data.daily?.sunrise?.[0];
  const set = data.daily?.sunset?.[0];
  if (!rise || !set) return null;
  return { place: loc.name, sunrise: rise.slice(11, 16), sunset: set.slice(11, 16) };
}

export function formatSunTimes(s: { sunrise: string; sunset: string; place: string }): string {
  return `In ${s.place} the sun rises at ${s.sunrise} and sets at ${s.sunset}.`;
}
