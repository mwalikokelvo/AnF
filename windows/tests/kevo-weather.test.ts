import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { weatherDescription, getWeather, formatWeather } from '../src/workspace/jarvis/voice/kevo-weather';

const reply = (status: number, body: unknown) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('Kevo weather', () => {
  it('maps WMO codes', () => {
    assert.equal(weatherDescription(0), 'clear sky');
    assert.equal(weatherDescription(95), 'thunderstorm');
    assert.equal(weatherDescription(999), 'mixed conditions');
  });

  it('parses current conditions from Open-Meteo', async () => {
    const report = await getWeather(51.5, -0.1, 'London', reply(200, {
      current: { temperature_2m: 12.3, relative_humidity_2m: 70, wind_speed_10m: 15.2, weather_code: 2 },
    }));
    assert.equal(report?.location, 'London');
    assert.equal(report?.temperature, 12.3);
    assert.equal(report?.description, 'partly cloudy');
  });

  it('formats a spoken report with attribution', () => {
    const text = formatWeather({
      location: 'London',
      temperature: 12.3,
      unit: '\u00b0C',
      description: 'partly cloudy',
      windSpeed: 15,
      humidity: 70,
    });
    assert.match(text, /London/);
    assert.match(text, /12\.3\u00b0C/);
    assert.match(text, /Open-Meteo/);
  });
});
