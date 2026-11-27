/**
 * Air quality via free Open-Meteo Air Quality API (no key), for "how's the air quality" or "air quality in London".
 * Complements existing weather. From Grok research into open weather services.
 */

import { onlineGet, type LookupFetch } from './kevo-online';
import { bareRequest } from './kevo-fun';

export function isAirQualityRequest(lower: string): boolean {
  const said = bareRequest(lower);
  return /^(?:what'?s|how'?s|how is|check|tell me) (?:the )?(?:air quality|aqi|air pollution)(?: in (.+))?$|^air quality(?: in (.+))?$/.test(said);
}

export function parseAirPlace(lower: string): string | null {
  const m = /(?:air quality|aqi|air pollution)(?: in | for )?([a-z0-9 ,.-]+)$/i.exec(bareRequest(lower));
  return m ? m[1].trim() : null;
}

/** Current European AQI and PM2.5. Place resolved by caller (same as weather). */
export async function airQuality(lat: number, lon: number, fetchFn?: LookupFetch): Promise<{ aqi: number; pm25: number; label: string } | null> {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5`;
  const res = await onlineGet(url, 'the air quality service', fetchFn);
  if (!res.ok) return null;
  const data = await res.json() as { current?: { european_aqi?: number; pm2_5?: number } };
  const aqi = data.current?.european_aqi;
  const pm25 = data.current?.pm2_5;
  if (aqi == null) return null;
  let label = 'good';
  if (aqi > 100) label = 'very poor';
  else if (aqi > 75) label = 'poor';
  else if (aqi > 50) label = 'moderate';
  else if (aqi > 25) label = 'fair';
  return { aqi: Math.round(aqi), pm25: Math.round(pm25 ?? 0), label };
}

export function formatAir(place: string, info: { aqi: number; pm25: number; label: string }): string {
  return `Air quality in ${place} is ${info.label}, European AQI ${info.aqi}, PM2.5 about ${info.pm25} micrograms.`;
}
