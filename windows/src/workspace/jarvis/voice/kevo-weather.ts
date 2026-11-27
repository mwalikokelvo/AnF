/**
 * Kevo Weather: free Open-Meteo forecast (no API key, non-commercial).
 * Geocoding via Open-Meteo's free geocoding API.
 * Attribution: Weather data by Open-Meteo.com (CC BY 4.0).
 */
import { onlineGet } from './kevo-online';

export interface WeatherResult {
  location: string;
  temperature: number;
  unit: string;
  description: string;
  windSpeed: number;
}

const WMO_CODES: Record<number, string> = {
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

export async function geocodeCity(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const data = await onlineGet(url);
  if (!data?.results?.[0]) return null;
  const r = data.results[0];
  return { lat: r.latitude, lon: r.longitude, name: r.name };
}

export async function getWeather(city: string): Promise<WeatherResult | null> {
  const geo = await geocodeCity(city);
  if (!geo) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=celsius&wind_speed_unit=kmh`;
  const data = await onlineGet(url);
  if (!data?.current) return null;
  const code = data.current.weather_code as number;
  return {
    location: geo.name,
    temperature: data.current.temperature_2m,
    unit: '°C',
    description: WMO_CODES[code] || 'unknown conditions',
    windSpeed: data.current.wind_speed_10m,
  };
}

export function formatWeather(w: WeatherResult): string {
  return `In ${w.location} it is ${w.temperature}${w.unit} with ${w.description}, wind ${w.windSpeed} km/h. Data from Open-Meteo.`;
}
