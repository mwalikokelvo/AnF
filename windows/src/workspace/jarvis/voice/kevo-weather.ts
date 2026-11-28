/**
 * Kevo Weather — Open-Meteo free API (no key required).
 * Current conditions + 3-day forecast for a place name.
 * Attribution: weather data by Open-Meteo.com (CC BY 4.0).
 */
export interface WeatherResult {
  place: string;
  currentTempC: number;
  condition: string;
  windKmh: number;
  humidity: number;
  forecast: { date: string; minC: number; maxC: number; precipMm: number }[];
  speech: string;
}

const WMO_CODES: Record<number, string> = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'depositing rime fog', 51: 'light drizzle', 61: 'slight rain',
  63: 'moderate rain', 65: 'heavy rain', 71: 'slight snow', 80: 'rain showers',
  95: 'thunderstorm',
};

export async function getWeather(place: string): Promise<WeatherResult | null> {
  if (!place?.trim()) return null;
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;
  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) return null;
  const geo = await geoRes.json();
  const hit = geo.results?.[0];
  if (!hit) return null;
  const { latitude: lat, longitude: lon, name, country } = hit;
  const fullPlace = country ? `${name}, ${country}` : name;

  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=3`;
  const wxRes = await fetch(wxUrl);
  if (!wxRes.ok) return null;
  const data = await wxRes.json();
  const cur = data.current || {};
  const daily = data.daily || {};
  const condition = WMO_CODES[cur.weather_code] || 'unknown conditions';
  const forecast = (daily.time || []).slice(0, 3).map((date: string, i: number) => ({
    date,
    minC: daily.temperature_2m_min?.[i] ?? 0,
    maxC: daily.temperature_2m_max?.[i] ?? 0,
    precipMm: daily.precipitation_sum?.[i] ?? 0,
  }));

  const speech = `In ${fullPlace} it is ${Math.round(cur.temperature_2m)} degrees Celsius, ${condition}, with ${Math.round(cur.wind_speed_10m)} kilometres per hour wind and ${cur.relative_humidity_2m} percent humidity. Over the next three days highs will be around ${forecast.map(f => Math.round(f.maxC)).join(', ')} degrees.`;

  return {
    place: fullPlace,
    currentTempC: cur.temperature_2m,
    condition,
    windKmh: cur.wind_speed_10m,
    humidity: cur.relative_humidity_2m,
    forecast,
    speech,
  };
}
