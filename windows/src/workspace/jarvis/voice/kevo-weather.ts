/**
 * Kevo Weather: free Open-Meteo forecasts, no API key.
 * Matches public weather assistant behavior: current conditions + short forecast.
 * Uses Open-Meteo geocoding + forecast endpoints.
 */
export interface WeatherResult {
  location: string;
  current: string;
  forecast: string;
  error?: string;
}

async function geocode(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data.results?.[0];
  if (!hit) return null;
  return { lat: hit.latitude, lon: hit.longitude, name: `${hit.name}, ${hit.country}` };
}

export async function getWeather(city: string): Promise<WeatherResult> {
  if (!city || !city.trim()) {
    return { location: '', current: '', forecast: '', error: 'Please say a city name.' };
  }
  try {
    const geo = await geocode(city.trim());
    if (!geo) return { location: city, current: '', forecast: '', error: `I could not find ${city}.` };
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
    const res = await fetch(url);
    if (!res.ok) return { location: geo.name, current: '', forecast: '', error: 'Weather service unavailable.' };
    const data = await res.json();
    const c = data.current;
    const d = data.daily;
    const codes: Record<number, string> = { 0: 'clear', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 51: 'light drizzle', 61: 'slight rain', 63: 'moderate rain', 65: 'heavy rain', 71: 'slight snow', 80: 'rain showers', 95: 'thunderstorm' };
    const currentDesc = codes[c.weather_code] || 'unknown conditions';
    const current = `It is ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C), ${currentDesc}, humidity ${c.relative_humidity_2m}%, wind ${c.wind_speed_10m} km/h.`;
    const days = ['Today', 'Tomorrow', 'Day after'];
    const forecastParts = d.time.slice(0, 3).map((t: string, i: number) => {
      const desc = codes[d.weather_code[i]] || 'mixed';
      return `${days[i]}: ${d.temperature_2m_min[i]}–${d.temperature_2m_max[i]}°C, ${desc}`;
    });
    return { location: geo.name, current, forecast: forecastParts.join('. ') };
  } catch (e) {
    return { location: city, current: '', forecast: '', error: `Weather lookup failed: ${String(e)}` };
  }
}

export function formatWeather(result: WeatherResult): string {
  if (result.error) return result.error;
  return `Weather for ${result.location}: ${result.current} ${result.forecast}`;
}
