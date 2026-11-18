export async function getWeather(lat = 40.7128, lon = -74.0060): Promise<string> {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`);
    if (!res.ok) throw new Error('service error');
    const data = await res.json();
    const temp = data.current?.temperature_2m ?? 'unknown';
    const wind = data.current?.wind_speed_10m ?? 'unknown';
    return `Current temperature is ${temp} degrees Celsius, wind ${wind} km/h. Data from Open-Meteo.`;
  } catch {
    return 'Sorry, weather is unavailable right now.';
  }
}
