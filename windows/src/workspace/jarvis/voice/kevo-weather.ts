/**
 * Kevo weather forecast using free Open-Meteo API (https://open-meteo.com).
 * No API key required. Current conditions and short forecast.
 * Example: "what's the weather in London" or "weather here" (needs location).
 */

import type { LookupFetch } from './kevo-online';
import { onlineGet } from './kevo-online';

export interface WeatherReport {
  location: string;
  temperature: number;
  unit: string;
  description: string;
  windSpeed?: number;
  humidity?: number;
}

const WMO_CODES: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'depositing rime fog',
  51: 'light drizzle',
  61: 'slight rain',
  71: 'slight snow',
  80: 'slight rain showers',
  95: 'thunderstorm',
};

/** Maps WMO weather code to a short English description. */
export function weatherDescription(code: number): string {
  return WMO_CODES[code] ?? 'mixed conditions';
}

/**
 * Current weather for a latitude/longitude pair.
 * Uses Open-Meteo forecast endpoint; attribution required under CC BY 4.0.
 */
export async function getWeather(lat: number, lon: number, locationName: string, fetchFn?: LookupFetch): Promise<WeatherReport | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=celsius`;
  const res = await onlineGet(url, 'the weather service', fetchFn);
  if (!res.ok) throw new Error(`the weather service answered ${res.status}.`);
  const data = (await res.json()) as {
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
      wind_speed_10m?: number;
      weather_code?: number;
    };
  };
  const cur = data.current;
  if (!cur || typeof cur.temperature_2m !== 'number') return null;
  return {
    location: locationName,
    temperature: Math.round(cur.temperature_2m * 10) / 10,
    unit: '\u00b0C',
    description: weatherDescription(cur.weather_code ?? 0),
    windSpeed: cur.wind_speed_10m,
    humidity: cur.relative_humidity_2m,
  };
}

export function formatWeather(report: WeatherReport): string {
  const wind = report.windSpeed != null ? `, wind ${Math.round(report.windSpeed)} km/h` : '';
  const hum = report.humidity != null ? `, humidity ${Math.round(report.humidity)}%` : '';
  return `In ${report.location} it is ${report.temperature}${report.unit}, ${report.description}${wind}${hum}. Data from Open-Meteo.`;
}
