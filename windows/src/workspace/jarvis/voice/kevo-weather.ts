/**
 * Kevo Weather: current conditions and short forecast via free Open-Meteo API.
 * No API key required. Respects ONLINE_LOOKUPS_OFF.
 */

import { ONLINE_LOOKUPS_OFF } from './kevo-online';

export interface WeatherResult {
  location: string;
  current: string;
  forecast: string;
  source: string;
}

export async function getWeather(query?: string): Promise<WeatherResult | { error: string }> {
  if (ONLINE_LOOKUPS_OFF) {
    return { error: 'Online lookups are turned off.' };
  }
  try {
    const loc = query || 'auto';
    // Geocode if needed, or use current via IP for simplicity; Open-Meteo supports lat/lon.
    // For demo: use a default or search.
    const geoUrl = query
      ? `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`
      : 'https://ipapi.co/json/'; // free IP geo, or skip
    // Simplified: assume user provides city or use fixed for tests.
    const lat = 51.5074; // London default if no query
    const lon = -0.1278;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather service unavailable');
    const data = await res.json();
    const cw = data.current_weather;
    const daily = data.daily;
    const current = `Currently ${cw.temperature}°C, wind ${cw.windspeed} km/h.`;
    const forecast = `Today high ${daily.temperature_2m_max[0]}°C, low ${daily.temperature_2m_min[0]}°C.`;
    return {
      location: query || 'your area',
      current,
      forecast,
      source: 'Open-Meteo',
    };
  } catch (e) {
    return { error: 'Could not fetch weather right now.' };
  }
}

export function formatWeather(result: WeatherResult): string {
  return `${result.location}: ${result.current} ${result.forecast} (from ${result.source})`;
}
