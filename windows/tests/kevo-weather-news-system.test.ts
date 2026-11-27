import { describe, it, expect, vi } from 'vitest';
import { getWeather, formatWeather } from '../src/workspace/jarvis/voice/kevo-weather';
import { getTopNews, formatNews } from '../src/workspace/jarvis/voice/kevo-news';
import { getSystemStatus } from '../src/workspace/jarvis/voice/kevo-system';

describe('Kevo weather/news/system', () => {
  it('formats weather result', () => {
    const r = { location: 'London', current: '15°C clear', forecast: 'Today 12-18', error: undefined };
    expect(formatWeather(r)).toContain('London');
    expect(formatWeather({ ...r, error: 'fail' })).toBe('fail');
  });

  it('formats news', () => {
    const items = [{ title: 'Test headline', link: 'http://x' }];
    expect(formatNews({ items })).toContain('Test headline');
  });

  it('system status summary', async () => {
    const s = await getSystemStatus();
    expect(s.summary).toMatch(/online|offline/);
  });
});
