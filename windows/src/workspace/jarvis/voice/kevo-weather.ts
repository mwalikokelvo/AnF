/**
 * Weather lookup for Kevo using the free Open-Meteo API (no key required).
 * https://open-meteo.com/en/docs
 */

export interface WeatherResult {
  location: string;
  temperature: number;
  unit: string;
  condition: string;
  windSpeed: number;
}

export async function getWeather(location: string): Promise<string> {
  const loc = String(location || '').trim();
  if (!loc) return 'Which city would you like the weather for, sir?';

  try {
    // Geocode first
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1&language=en&format=json`
    );
    if (!geoRes.ok) throw new Error('Geocoding failed');
    const geo = await geoRes.json();
    if (!geo.results?.length) return `I could not find a location called ${loc}, sir.`;

    const { latitude, longitude, name, country } = geo.results[0];
    const place = `${name}${country ? ', ' + country : ''}`;

    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=celsius`
    );
    if (!weatherRes.ok) throw new Error('Weather fetch failed');
    const data = await weatherRes.json();
    const current = data.current;
    if (!current) return `No current weather data for ${place}, sir.`;

    const temp = Math.round(current.temperature_2m);
    const code = current.weather_code;
    const condition = weatherCodeToText(code);
    const wind = Math.round(current.wind_speed_10m);

    return `The weather in ${place} is ${condition}, ${temp} degrees Celsius, with winds at ${wind} kilometres per hour, sir.`;
  } catch (err: any) {
    return `I could not fetch the weather right now, sir. ${err?.message || ''}`.trim();
  }
}

function weatherCodeToText(code: number): string {
  const map: Record<number, string> = {
    0: 'clear skies',
    1: 'mainly clear',
    2: 'partly cloudy',
    3: 'overcast',
    45: 'foggy',
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
    96: 'thunderstorm with slight hail',
    99: 'thunderstorm with heavy hail',
  };
  return map[code] || 'unknown conditions';
}
