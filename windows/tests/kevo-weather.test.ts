import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { weatherSummary, formatWeather } from '../src/workspace/jarvis/voice/kevo-weather';

describe('Kevo weather via Open-Meteo', () => {
  it('returns a speakable summary for a known place', async () => {
    const res = await weatherSummary('Berlin', async (url) => {
      if (url.includes('geocoding')) {
        return { ok: true, status: 200, json: async () => ({ results: [{ latitude: 52.52, longitude: 13.41, name: 'Berlin' }] }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          current: { temperature_2m: 18.4, weather_code: 2, wind_speed_10m: 12 },
          current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
        }),
      };
    });
    assert.ok(res);
    assert.equal(res!.location, 'Berlin');
    assert.equal(res!.temperature, 18);
    assert.equal(res!.description, 'partly cloudy');
    assert.match(formatWeather(res!), /Berlin/);
    assert.match(formatWeather(res!), /18°C/);
  });

  it('returns null when geocoding fails', async () => {
    const res = await weatherSummary('NowhereLand', async () => ({ ok: false, status: 404, json: async () => ({}) }));
    assert.equal(res, null);
  });

  it('defaults to London when no place is given', async () => {
    let called = '';
    await weatherSummary(undefined, async (url) => {
      called = url;
      if (url.includes('geocoding')) {
        return { ok: true, status: 200, json: async () => ({ results: [{ latitude: 51.5, longitude: -0.1, name: 'London' }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ current: { temperature_2m: 10, weather_code: 0 } }) };
    });
    assert.match(called, /London/);
  });
});
