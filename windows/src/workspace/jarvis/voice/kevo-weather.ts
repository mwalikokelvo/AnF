/**
 * Kevo Weather: current conditions and forecast using Open-Meteo (free, no key, documented API).
 * Supports "what's the weather", "weather in London", "will it rain tomorrow".
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export interface WeatherResult {
  location: string;
  current: string;
  forecast?: string;
}

async function geocode(place: string, fetchFn?: LookupFetch): Promise<{ lat: number; lon: number; name: string }> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;
  const res = await onlineGet(url, 'the geocoding service', fetchFn);
  if (!res.ok) throw new Error('could not find that place');
  const data = await res.json() as { results?: { latitude: number; longitude: number; name: string }[] };
  const r = data.results?.[0];
  if (!r) throw new Error('place not found');
  return { lat: r.latitude, lon: r.longitude, name: r.name };
}

export async function getWeather(place = 'local', fetchFn?: LookupFetch): Promise<WeatherResult> {
  let lat = 0, lon = 0, name = 'here';
  if (place && place !== 'local' && place !== 'here') {
    const geo = await geocode(place, fetchFn);
    lat = geo.lat; lon = geo.lon; name = geo.name;
  } else {
    throw new Error('please specify a city for weather');
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;
  const res = await onlineGet(url, 'the weather service', fetchFn);
  if (!res.ok) throw new Error('weather service unavailable');
  const data = await res.json() as any;
  const curr = data.current;
  const code = curr.weather_code;
  const desc = weatherCodeToDesc(code);
  const current = `${desc}, ${curr.temperature_2m}°C, humidity ${curr.relative_humidity_2m}%, wind ${curr.wind_speed_10m} km/h`;
  let forecast = '';
  if (data.daily) {
    const max = data.daily.temperature_2m_max[0];
    const min = data.daily.temperature_2m_min[0];
    const rain = data.daily.precipitation_probability_max[0];
    forecast = `Today: high ${max}°C, low ${min}°C, rain chance ${rain}%.`;
  }
  return { location: name, current, forecast };
}

function weatherCodeToDesc(code: number): string {
  const map: Record<number, string> = {
    0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'fog', 48: 'depositing rime fog', 51: 'light drizzle', 61: 'slight rain',
    71: 'slight snow', 80: 'slight rain showers', 95: 'thunderstorm',
  };
  return map[code] || 'unknown conditions';
}

export function parseWeatherRequest(lower: string): string | null {
  const m = /(?:weather|forecast)(?: in| for)? ([a-z\s]+)/i.exec(lower);
  return m ? m[1].trim() : null;
}
