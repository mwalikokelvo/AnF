/** Current weather via the free Open-Meteo API (no key required, https://open-meteo.com/). */

import { onlineGet, type LookupFetch } from './kevo-online';

export interface WeatherSummary {
  location: string;
  temperature: number;
  unit: string;
  description: string;
  windSpeed: number;
  windUnit: string;
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

/** Simple geocoding via Open-Meteo's free geocoding API. */
async function geocode(place: string, fetchFn?: LookupFetch): Promise<{ lat: number; lon: number; name: string } | null> {
  const q = place.trim();
  if (!q) return null;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
  const res = await onlineGet(url, 'Open-Meteo geocoding', fetchFn);
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: Array<{ latitude: number; longitude: number; name: string }> };
  const hit = data.results?.[0];
  return hit ? { lat: hit.latitude, lon: hit.longitude, name: hit.name } : null;
}

/** Current weather summary, or null on failure. Defaults to London if no place given. */
export async function weatherSummary(place?: string, fetchFn?: LookupFetch): Promise<WeatherSummary | null> {
  const loc = await geocode(place || 'London', fetchFn);
  if (!loc) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
  const res = await onlineGet(url, 'Open-Meteo', fetchFn);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
    current_units?: { temperature_2m?: string; wind_speed_10m?: string };
  };
  const cur = data.current;
  if (!cur || cur.temperature_2m == null) return null;
  const code = cur.weather_code ?? 0;
  return {
    location: loc.name,
    temperature: Math.round(cur.temperature_2m),
    unit: data.current_units?.temperature_2m || '°C',
    description: WEATHER_CODES[code] || 'unknown conditions',
    windSpeed: Math.round(cur.wind_speed_10m || 0),
    windUnit: data.current_units?.wind_speed_10m || 'km/h',
  };
}

/** TTS-friendly one-sentence summary. */
export function formatWeather(w: WeatherSummary): string {
  return `In ${w.location} it is ${w.temperature}${w.unit} with ${w.description} and wind at ${w.windSpeed} ${w.windUnit}.`;
}
