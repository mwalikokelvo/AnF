/**
 * Kevo Weather — Open-Meteo free API (no key, CC BY 4.0).
 * Inspired by Alexa/Siri weather intents; local-first with network opt-in.
 */
export interface WeatherResult {
  temperature: number;
  windSpeed: number;
  weatherCode: number;
  description: string;
  location: string;
}

const WEATHER_CODES: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'depositing rime fog',
  51: 'light drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'slight snow',
  80: 'slight rain showers',
  95: 'thunderstorm',
};

export async function getWeather(lat: number, lon: number, location = 'your location'): Promise<WeatherResult | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const current = data.current || {};
    const code = current.weather_code ?? 0;
    return {
      temperature: current.temperature_2m ?? 0,
      windSpeed: current.wind_speed_10m ?? 0,
      weatherCode: code,
      description: WEATHER_CODES[code] || 'unknown conditions',
      location,
    };
  } catch {
    return null;
  }
}

export function formatWeather(w: WeatherResult): string {
  return `In ${w.location} it is ${w.temperature}°C with ${w.description} and wind at ${w.windSpeed} km/h.`;
}
