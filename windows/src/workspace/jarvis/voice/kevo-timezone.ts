/**
 * Kevo Timezone — current time in a named city using Open-Meteo geocoding (free).
 */
export interface TimeResult { place: string; localTime: string; timezone: string; speech: string; }

export async function getTimeIn(place: string): Promise<TimeResult | null> {
  if (!place?.trim()) return null;
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;
  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) return null;
  const geo = await geoRes.json();
  const hit = geo.results?.[0];
  if (!hit) return null;
  const { latitude: lat, longitude: lon, name, country, timezone } = hit;
  const fullPlace = country ? `${name}, ${country}` : name;
  const tz = timezone || 'UTC';

  const now = new Date();
  const local = now.toLocaleString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const speech = `The current time in ${fullPlace} is ${local}.`;
  return { place: fullPlace, localTime: local, timezone: tz, speech };
}
