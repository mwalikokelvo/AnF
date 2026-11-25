/**
 * Kevo Weather: current conditions and short forecast via free Open-Meteo API.
 * No API key required. Geocoding + forecast. Inspired by Siri/Alexa/Google weather skills.
 * Observable differences: no personalized "your location" without permission; uses city name or defaults to London for demo; weather codes mapped to text.
 */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

interface GeoResult {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
}

async function geocode(city: string): Promise<GeoResult | null> {
  const q = encodeURIComponent(city.trim());
  if (!q) return null;
  try {
    const res = await fetch(`${GEOCODE_URL}?name=${q}&count=1&language=en&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    const first = data?.results?.[0];
    if (!first) return null;
    return { latitude: first.latitude, longitude: first.longitude, name: first.name, country: first.country };
  } catch {
    return null;
  }
}

function weatherCodeToText(code: number): string {
  const map: Record<number, string> = {
    0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'fog', 48: 'depositing rime fog',
    51: 'light drizzle', 53: 'moderate drizzle', 55: 'dense drizzle',
    61: 'slight rain', 63: 'moderate rain', 65: 'heavy rain',
    71: 'slight snow', 73: 'moderate snow', 75: 'heavy snow',
    80: 'slight rain showers', 81: 'moderate rain showers', 82: 'violent rain showers',
    95: 'thunderstorm',
  };
  return map[code] || 'unknown conditions';
}

export async function getWeather(city: string = 'London'): Promise<string> {
  const place = city.trim() || 'London';
  const geo = await geocode(place);
  if (!geo) return `I could not find weather for ${place}, sir. Try a major city.`;

  try {
    const url = `${FORECAST_URL}?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) return `Weather service is unavailable right now for ${geo.name}, sir.`;
    const data = await res.json();
    const cur = data.current;
    const daily = data.daily;
    const temp = Math.round(cur.temperature_2m);
    const cond = weatherCodeToText(cur.weather_code);
    const wind = Math.round(cur.wind_speed_10m);
    const max = daily?.temperature_2m_max?.[0] != null ? Math.round(daily.temperature_2m_max[0]) : null;
    const min = daily?.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : null;
    let reply = `In ${geo.name}${geo.country ? ', ' + geo.country : ''} it is ${temp} degrees with ${cond}, wind ${wind} kilometres per hour.`;
    if (max != null && min != null) reply += ` Today: high ${max}, low ${min}.`;
    return reply + ', sir.';
  } catch {
    return `I could not reach the weather service for ${geo.name}, sir.`;
  }
}
