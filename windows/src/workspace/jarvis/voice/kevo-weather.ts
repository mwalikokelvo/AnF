/**
 * Kevo Weather: current conditions and short forecast via Open-Meteo (no API key, free non-commercial).
 * Geocoding also via Open-Meteo. Attribution required under CC BY 4.0.
 *
 * Inspired by voice assistants (Siri, Alexa, Google, OVOS weather skill): "what's the weather",
 * "weather in [place]", "will it rain tomorrow".
 * Reverse-engineered from public docs and open-source skill patterns; not copying proprietary code.
 */

export interface WeatherResult {
  location: string;
  temperature: number;
  unit: string;
  condition: string;
  windSpeed: number;
  humidity?: number;
  forecast?: string;
}

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

async function geocode(place: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const result = data.results?.[0];
  if (!result) return null;
  return { lat: result.latitude, lon: result.longitude, name: result.name + (result.country ? `, ${result.country}` : '') };
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

export async function getWeather(place?: string): Promise<WeatherResult | { error: string }> {
  let lat = 51.5074; // London default if no place and no geo
  let lon = -0.1278;
  let locationName = 'London';

  if (place && place.trim()) {
    const geo = await geocode(place.trim());
    if (!geo) return { error: `Could not find location "${place}"` };
    lat = geo.lat;
    lon = geo.lon;
    locationName = geo.name;
  }

  const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`;
  const res = await fetch(url);
  if (!res.ok) return { error: 'Weather service unavailable' };
  const data = await res.json();

  const current = data.current;
  if (!current) return { error: 'No current weather data' };

  const condition = weatherCodeToText(current.weather_code);
  const daily = data.daily;
  let forecast = '';
  if (daily?.time?.[1]) {
    const tomorrowCode = daily.weather_code[1];
    const max = daily.temperature_2m_max[1];
    const min = daily.temperature_2m_min[1];
    forecast = `Tomorrow: ${weatherCodeToText(tomorrowCode)}, high ${Math.round(max)}°, low ${Math.round(min)}°.`;
  }

  return {
    location: locationName,
    temperature: Math.round(current.temperature_2m),
    unit: data.current_units?.temperature_2m || '°C',
    condition,
    windSpeed: Math.round(current.wind_speed_10m),
    humidity: current.relative_humidity_2m,
    forecast,
  };
}

export function formatWeather(result: WeatherResult): string {
  let text = `In ${result.location}, it's ${result.temperature}${result.unit} and ${result.condition}. Wind ${result.windSpeed} km/h.`;
  if (result.humidity) text += ` Humidity ${result.humidity}%.`;
  if (result.forecast) text += ` ${result.forecast}`;
  text += ' Data from Open-Meteo.';
  return text;
}
