/**
 * Kevo Weather — Open-Meteo (no API key) + Nominatim geocoding.
 * Free, privacy-friendly, documented public APIs.
 * Inspired by common voice-assistant weather capabilities (Siri, Alexa, Gemini, OVOS skills).
 */

export interface WeatherResult {
  city: string;
  temperature: number;
  unit: 'C' | 'F';
  conditions: string;
  windSpeed: number;
  humidity: number;
  speech: string;
}

export async function getWeather(city: string, unit: 'C' | 'F' = 'C'): Promise<WeatherResult | null> {
  if (!city?.trim()) return null;
  try {
    // Nominatim geocode (OpenStreetMap)
    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
    const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'AnF-Kevo/1.0 (private local assistant)' } });
    if (!geoRes.ok) return null;
    const geo = await geoRes.json();
    if (!geo?.[0]) return null;
    const { lat, lon, display_name } = geo[0];

    // Open-Meteo current weather
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=${unit === 'F' ? 'fahrenheit' : 'celsius'}`;
    const wRes = await fetch(weatherUrl);
    if (!wRes.ok) return null;
    const w = await wRes.json();
    const c = w.current;
    if (!c) return null;

    const codes: Record<number, string> = {
      0: 'clear', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
      45: 'fog', 48: 'depositing rime fog', 51: 'light drizzle', 61: 'slight rain',
      71: 'slight snow', 80: 'rain showers', 95: 'thunderstorm',
    };
    const conditions = codes[c.weather_code] || 'unknown conditions';
    const temp = Math.round(c.temperature_2m);
    const speech = `In ${display_name.split(',')[0]}, it is ${temp} degrees ${unit === 'F' ? 'Fahrenheit' : 'Celsius'}, ${conditions}, wind ${Math.round(c.wind_speed_10m)} kilometres per hour, humidity ${c.relative_humidity_2m} percent.`;

    return {
      city: display_name,
      temperature: temp,
      unit,
      conditions,
      windSpeed: c.wind_speed_10m,
      humidity: c.relative_humidity_2m,
      speech,
    };
  } catch {
    return null;
  }
}

export function formatWeatherSpeech(result: WeatherResult | null, city: string): string {
  if (!result) return `I could not fetch the weather for ${city} right now, sir. Check your connection.`;
  return result.speech;
}
