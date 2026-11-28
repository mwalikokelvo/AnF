/**
 * Kevo Air Quality: Current air quality index via free Open-Meteo API.
 * Complements weather. No key required.
 */

const AQI_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export async function getAirQuality(city: string): Promise<string | null> {
  try {
    // First geocode city (reuse Open-Meteo geocoding)
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
    const geoData = await geo.json();
    if (!geoData.results?.[0]) return null;
    const { latitude, longitude } = geoData.results[0];
    const res = await fetch(`${AQI_URL}?latitude=${latitude}&longitude=${longitude}&current=us_aqi,european_aqi`);
    const data = await res.json();
    const aqi = data.current?.us_aqi ?? data.current?.european_aqi;
    if (aqi == null) return null;
    const level = aqi <= 50 ? 'good' : aqi <= 100 ? 'moderate' : aqi <= 150 ? 'unhealthy for sensitive groups' : 'unhealthy';
    return `Air quality in ${city} is ${level}, with an AQI of ${Math.round(aqi)}.`;
  } catch {
    return null;
  }
}
