/** Tests for Kevo weather using Open-Meteo (mocked fetch). */

import assert from 'node:assert/strict';
import { getWeather, formatWeather } from '../src/workspace/jarvis/voice/kevo-weather.js';

const mockFetch = async (url: string) => {
  if (url.includes('geocoding-api')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ name: 'London', latitude: 51.5074, longitude: -0.1278, country: 'United Kingdom' }]
      })
    };
  }
  if (url.includes('api.open-meteo.com')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        current: { temperature_2m: 12.3, weather_code: 2 }
      })
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

export async function runWeatherTests() {
  const report = await getWeather('London', mockFetch);
  assert.ok(report);
  assert.equal(report.place, 'London, United Kingdom');
  assert.equal(report.temperature, 12);
  assert.equal(report.description, 'partly cloudy');
  assert.match(formatWeather(report), /In London, United Kingdom it is 12\u00b0C and partly cloudy\./);
  console.log('kevo-weather tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWeatherTests().catch(console.error);
}
