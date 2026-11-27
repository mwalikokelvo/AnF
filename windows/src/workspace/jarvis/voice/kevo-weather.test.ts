import { describe, it, expect, vi } from 'vitest';
import { fetchWeather, formatWeather } from './kevo-weather';

describe('Kevo Weather', () => {
  it('formats a successful result', () => {
    const result = {
      temperature: 15,
      unit: '°C',
      windSpeed: 10,
      description: 'clear sky',
      location: 'London',
    };
    const text = formatWeather(result);
    expect(text).toContain('London');
    expect(text).toContain('15°C');
    expect(text).toContain('Open-Meteo');
  });

  it('handles error', () => {
    const result = {
      temperature: 0,
      unit: '°C',
      windSpeed: 0,
      description: 'unavailable',
      location: 'Unknown',
      error: 'network',
    };
    expect(formatWeather(result)).toContain('couldn\'t get the weather');
  });

  it('fetchWeather uses Open-Meteo (mocked)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        current: { temperature_2m: 20, wind_speed_10m: 5, weather_code: 0 },
        current_units: { temperature_2m: '°C' },
      }),
    });
    const r = await fetchWeather(0, 0, 'Test');
    expect(r.temperature).toBe(20);
    expect(r.description).toBe('clear sky');
  });
});
