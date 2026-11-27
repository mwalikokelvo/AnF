/**
 * Kevo Weather: Free weather forecast using Open-Meteo (no API key, non-commercial).
 * Attribution: Weather data by Open-Meteo.com (CC BY 4.0).
 * Uses browser geolocation if available, falls back to a default location.
 */

export interface WeatherResult {
  temperature: number;
  unit: string;
  windSpeed: number;
  description: string;
  location: string;
  error?: string;
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
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'slight snow',
  80: 'slight rain showers',
  95: 'thunderstorm',
};

export async function fetchWeather(lat = 51.5074, lon = -0.1278, locationName = 'London'): Promise<WeatherResult> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const current = data.current;
    const code = current.weather_code as number;
    const desc = WMO_CODES[code] || 'unknown conditions';
    return {
      temperature: current.temperature_2m,
      unit: data.current_units?.temperature_2m || '°C',
      windSpeed: current.wind_speed_10m,
      description: desc,
      location: locationName,
    };
  } catch (err) {
    return {
      temperature: 0,
      unit: '°C',
      windSpeed: 0,
      description: 'unavailable',
      location: locationName,
      error: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}

export function formatWeather(result: WeatherResult): string {
  if (result.error) return `Sorry, I couldn't get the weather: ${result.error}.`;
  return `In ${result.location}, it's ${result.temperature}${result.unit} with ${result.description} and wind at ${result.windSpeed} km/h. Data from Open-Meteo.`;
}
