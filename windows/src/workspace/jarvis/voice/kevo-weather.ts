/**
 * Kevo Weather: Free forecast using Open-Meteo (no API key).
 * https://open-meteo.com/ – free for non-commercial, attribution required.
 */

export interface WeatherResult {
  location: string;
  temperature: number;
  unit: string;
  windSpeed: number;
  description: string;
  speech: string;
}

export async function getWeather(lat: number, lon: number, locationName = 'your location'): Promise<WeatherResult | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const current = data.current;
    if (!current) return null;
    const temp = current.temperature_2m;
    const wind = current.wind_speed_10m;
    const code = current.weather_code;
    const desc = weatherCodeToDesc(code);
    const speech = `In ${locationName}, it is ${temp} degrees with ${desc} and wind at ${wind} kilometres per hour.`;
    return {
      location: locationName,
      temperature: temp,
      unit: data.current_units?.temperature_2m || '°C',
      windSpeed: wind,
      description: desc,
      speech,
    };
  } catch {
    return null;
  }
}

function weatherCodeToDesc(code: number): string {
  if (code === 0) return 'clear sky';
  if (code <= 3) return 'partly cloudy';
  if (code <= 49) return 'foggy';
  if (code <= 69) return 'rainy';
  if (code <= 79) return 'snowy';
  if (code <= 99) return 'thunderstorms';
  return 'variable conditions';
}
