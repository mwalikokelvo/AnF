/**
 * Weather for Kevo using the free Open-Meteo API (no key required).
 * Inspired by voice assistants' weather capabilities. Location defaults to a sensible place if none given.
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export interface WeatherResult {
  location: string;
  temperature: number;
  unit: string;
  description: string;
  windSpeed: number;
}

const DEFAULT_LOCATION = 'Nairobi'; // or detect, but offline-friendly default

export async function getWeather(location?: string, fetchFn?: LookupFetch): Promise<WeatherResult> {
  const loc = (location || DEFAULT_LOCATION).trim();
  // Geocode first
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1`;
  const geoRes = await onlineGet(geoUrl, 'geocoding', fetchFn);
  if (!geoRes.ok) throw new Error('Could not find location');
  const geo = await geoRes.json() as any;
  const place = geo.results?.[0];
  if (!place) throw new Error(`No place found for ${loc}`);

  const { latitude, longitude, name, country } = place;
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
  const wRes = await onlineGet(weatherUrl, 'weather', fetchFn);
  if (!wRes.ok) throw new Error('Weather service unavailable');
  const data = await wRes.json() as any;
  const current = data.current;
  const code = current.weather_code;
  const descriptions: Record<number, string> = {
    0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'fog', 48: 'depositing rime fog', 51: 'light drizzle', 61: 'slight rain',
    71: 'slight snow', 80: 'slight rain showers', 95: 'thunderstorm',
  };
  return {
    location: `${name}, ${country}`,
    temperature: current.temperature_2m,
    unit: data.current_units?.temperature_2m || '°C',
    description: descriptions[code] || 'unknown conditions',
    windSpeed: current.wind_speed_10m,
  };
}

export function formatWeather(w: WeatherResult): string {
  return `In ${w.location} it is ${w.temperature}${w.unit} with ${w.description}. Wind is ${w.windSpeed} km/h.`;
}
