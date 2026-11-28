/**
 * Unit tests for the three new Kevo capabilities (mocked fetch).
 */
import { getWeather } from './kevo-weather';
import { getTopNews } from './kevo-news';
import { getTimeIn } from './kevo-timezone';

describe('Kevo weather / news / timezone', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('getWeather returns speech for a known place', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ name: 'London', country: 'UK', latitude: 51.5, longitude: -0.1 }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        current: { temperature_2m: 12, relative_humidity_2m: 80, weather_code: 2, wind_speed_10m: 15 },
        daily: { time: ['2026-11-28'], temperature_2m_max: [14], temperature_2m_min: [8], precipitation_sum: [0] },
      }) });
    const result = await getWeather('London');
    expect(result).not.toBeNull();
    expect(result!.speech).toContain('London');
    expect(result!.currentTempC).toBe(12);
  });

  test('getTopNews extracts headlines', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => `<rss><item><title><![CDATA[World leaders meet]]></title></item><item><title><![CDATA[Climate report]]></title></item></rss>` });
    const result = await getTopNews(2);
    expect(result!.items.length).toBe(2);
    expect(result!.speech).toContain('World leaders meet');
  });

  test('getTimeIn returns local time speech', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ name: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', latitude: 35.6, longitude: 139.7 }] }) });
    const result = await getTimeIn('Tokyo');
    expect(result).not.toBeNull();
    expect(result!.speech).toContain('Tokyo');
    expect(result!.timezone).toBe('Asia/Tokyo');
  });
});
