/**
 * Kevo Weather: local-first weather lookup using the free Open-Meteo API.
 * No API key required. Returns current conditions and a short forecast.
 * Inspired by voice assistants' weather capabilities; implemented from public docs.
 */

export interface WeatherResult {
  location: string;
  temperature: number;
  unit: string;
  description: string;
  forecast?: string;
}

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

export async function getWeather(lat: number, lon: number, locationName = 'your location'): Promise<WeatherResult | null> {
  try {
    const url = `${OPEN_METEO}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const temp = data.current?.temperature_2m ?? 0;
    const code = data.current?.weather_code ?? 0;
    const desc = weatherCodeToText(code);
    const max = data.daily?.temperature_2m_max?.[0];
    const min = data.daily?.temperature_2m_min?.[0];
    return {
      location: locationName,
      temperature: Math.round(temp),
      unit: '°C',
      description: desc,
      forecast: max != null && min != null ? `High ${Math.round(max)}°, low ${Math.round(min)}°` : undefined,
    };
  } catch {
    return null;
  }
}

function weatherCodeToText(code: number): string {
  if (code === 0) return 'clear sky';
  if (code <= 3) return 'partly cloudy';
  if (code <= 48) return 'foggy';
  if (code <= 67) return 'rainy';
  if (code <= 77) return 'snowy';
  if (code <= 82) return 'rain showers';
  if (code <= 86) return 'snow showers';
  return 'stormy';
}

export function formatWeather(w: WeatherResult): string {
  let s = `It's ${w.temperature}${w.unit} and ${w.description} in ${w.location}.`;
  if (w.forecast) s += ` ${w.forecast}.`;
  return s;
}
