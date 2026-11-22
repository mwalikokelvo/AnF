/** Current weather for a place, from the free Open-Meteo API (no key required).
 * https://open-meteo.com/
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export interface WeatherReport {
  place: string;
  temperature: number;
  unit: string;
  description: string;
}

const WEATHER_CODES: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'depositing rime fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'slight snow',
  73: 'moderate snow',
  75: 'heavy snow',
  80: 'slight rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  95: 'thunderstorm',
};

/** Get current weather for a city or place name. */
export async function getWeather(place: string, fetchFn?: LookupFetch): Promise<WeatherReport | null> {
  const q = place.trim();
  if (!q) return null;

  // Geocode first
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
  const geoRes = await onlineGet(geoUrl, 'Open-Meteo geocoding', fetchFn);
  if (!geoRes.ok) throw new Error(`Geocoding failed: ${geoRes.status}`);
  const geoData = (await geoRes.json()) as { results?: Array<{ name: string; latitude: number; longitude: number; country?: string }> };
  const hit = geoData.results?.[0];
  if (!hit) return null;

  const lat = hit.latitude;
  const lon = hit.longitude;
  const placeName = hit.country ? `${hit.name}, ${hit.country}` : hit.name;

  // Current weather
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=celsius`;
  const wRes = await onlineGet(weatherUrl, 'Open-Meteo weather', fetchFn);
  if (!wRes.ok) throw new Error(`Weather failed: ${wRes.status}`);
  const wData = (await wRes.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
  const cur = wData.current;
  if (!cur || cur.temperature_2m == null || cur.weather_code == null) return null;

  const desc = WEATHER_CODES[cur.weather_code] || 'unknown conditions';
  return {
    place: placeName,
    temperature: Math.round(cur.temperature_2m),
    unit: '\u00b0C',
    description: desc,
  };
}

export function formatWeather(report: WeatherReport): string {
  return `In ${report.place} it is ${report.temperature}${report.unit} and ${report.description}.`;
}
