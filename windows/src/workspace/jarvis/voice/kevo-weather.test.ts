import { describe, it, expect } from 'vitest';
import { formatWeather, type WeatherResult } from './kevo-weather';

describe('kevo-weather', () => {
  it('formats a weather result', () => {
    const w: WeatherResult = {
      location: 'London',
      temperature: 12,
      unit: '°C',
      description: 'partly cloudy',
      windSpeed: 15,
    };
    const text = formatWeather(w);
    expect(text).toContain('London');
    expect(text).toContain('12');
    expect(text).toContain('partly cloudy');
    expect(text).toContain('Open-Meteo');
  });
});
