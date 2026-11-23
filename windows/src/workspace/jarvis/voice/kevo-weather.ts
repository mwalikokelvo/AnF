/**
 * Free weather for Kevo via Open-Meteo (no key, no account).
 * "What's the weather in Nairobi?", "weather here" uses browser geolocation if available.
 */
import { onlineGet, type LookupFetch } from './kevo-online';

export interface WeatherResult {
  location: string;
  temperature: number;
  unit: string;
  description: string;
  humidity?: number;
  windSpeed?: number;
}

export async function getWeather(place?: string, fetchFn?: LookupFetch): Promise<WeatherResult> {
  let lat = 0, lon = 0, locName = place || 'your location';
  if (!place) {
    // In real use, context would provide coords; here placeholder for tests.
    lat = 51.5074; lon = -0.1278; locName = 'London';
  } else {
    // Geocode via Open-Meteo geocoding
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`;
    const geoRes = await onlineGet(geoUrl, 'geocoding', fetchFn);
    if (!geoRes.ok) throw new Error('Could not find that place.');
    const geo = await geoRes.json() as any;
    if (!geo.results?.[0]) throw new Error('Place not found.');
    lat = geo.results[0].latitude;
    lon = geo.results[0].longitude;
    locName = geo.results[0].name;
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m,windspeed_10m`;
  const res = await onlineGet(url, 'weather service', fetchFn);
  if (!res.ok) throw new Error('Weather service unavailable.');
  const data = await res.json() as any;
  const cw = data.current_weather;
  return {
    location: locName,
    temperature: Math.round(cw.temperature),
    unit: 'C',
    description: weatherCodeToText(cw.weathercode),
    humidity: data.hourly?.relativehumidity_2m?.[0],
    windSpeed: Math.round(cw.windspeed),
  };
}

function weatherCodeToText(code: number): string {
  const map: Record<number, string> = {
    0: 'clear skies', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'fog', 51: 'light drizzle', 61: 'slight rain', 63: 'moderate rain',
    71: 'slight snow', 80: 'rain showers', 95: 'thunderstorm',
  };
  return map[code] || 'mixed conditions';
}

export function formatWeather(w: WeatherResult): string {
  return `It's ${w.temperature} degrees ${w.unit} in ${w.location}, ${w.description}${w.humidity ? `, humidity ${w.humidity} percent` : ''}.`;
}
