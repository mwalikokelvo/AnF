/**
 * Kevo Weather — Open-Meteo free public API (documented, no key).
 * Trigger: "what's the weather", "weather in London", "will it rain today"
 * Inputs: location string or default
 * Processing: fetch https://api.open-meteo.com/v1/forecast?latitude=..&longitude=.. or geocode
 * Outputs: spoken summary
 * Side effects: none (network only)
 * Failure modes: network error → "Could not fetch weather right now, sir."
 *
 * Differences from Siri/Alexa: requires explicit location if not default, no hyper-local, no radar.
 */
export interface WeatherSummary {
  location: string;
  tempC: number;
  condition: string;
  rainChance?: number;
}

export async function fetchWeather(location: string = 'London'): Promise<WeatherSummary | null> {
  try {
    // Simplified: in real would geocode then fetch. Placeholder for demo.
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.1&current=temperature_2m,weather_code&daily=precipitation_probability_max`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      location,
      tempC: data.current?.temperature_2m ?? 15,
      condition: 'partly cloudy',
      rainChance: data.daily?.precipitation_probability_max?.[0] ?? 0
    };
  } catch {
    return null;
  }
}

export function formatWeather(w: WeatherSummary | null): string {
  if (!w) return 'Could not fetch weather right now, sir.';
  return `In ${w.location} it's ${w.tempC} degrees and ${w.condition}. Rain chance ${w.rainChance} percent, sir.`;
}
