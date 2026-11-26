/**
 * Kevo weather via Open-Meteo (free, no key, CC BY 4.0).
 * "What's the weather in Nairobi?", "weather tomorrow".
 * Sends only the place name for geocoding; nothing personal.
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export interface WeatherResult {
  place: string;
  tempC: number;
  condition: string;
  windKmh: number;
}

const WMO: Record<number, string> = {
  0: 'clear', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'depositing rime fog', 51: 'light drizzle', 61: 'slight rain',
  63: 'moderate rain', 65: 'heavy rain', 71: 'slight snow', 80: 'rain showers',
  95: 'thunderstorm',
};

export function conditionFromCode(code: number): string {
  return WMO[code] ?? 'mixed conditions';
}

export async function fetchWeather(place: string, fetchFn?: LookupFetch): Promise<WeatherResult | null> {
  const geo = await onlineGet(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`,
    'geocoding',
    fetchFn,
  );
  if (!geo.ok) return null;
  const geoData = (await geo.json()) as { results?: { latitude: number; longitude: number; name: string }[] };
  const loc = geoData.results?.[0];
  if (!loc) return null;

  const wx = await onlineGet(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,wind_speed_10m`,
    'weather',
    fetchFn,
  );
  if (!wx.ok) return null;
  const data = (await wx.json()) as { current?: { temperature_2m: number; weather_code: number; wind_speed_10m: number } };
  const cur = data.current;
  if (!cur) return null;

  return {
    place: loc.name,
    tempC: cur.temperature_2m,
    condition: conditionFromCode(cur.weather_code),
    windKmh: cur.wind_speed_10m,
  };
}

export function formatWeather(w: WeatherResult): string {
  return `In ${w.place} it is ${Math.round(w.tempC)} degrees, ${w.condition}, with wind at ${Math.round(w.windKmh)} kilometres per hour.`;
}
