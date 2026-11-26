import { describe, it, expect } from 'vitest';
import { createPlaylist, addToPlaylist, listPlaylist } from '../kevo-playlist';
import { formatWeather, type WeatherResult } from '../kevo-weather';
import { formatNews, type NewsItem } from '../kevo-news';

describe('Kevo new features', () => {
  it('creates and manages a local playlist', () => {
    const r1 = createPlaylist('Chill');
    expect(r1).toContain('Created');
    const r2 = addToPlaylist('Chill', 'Track A');
    expect(r2).toContain('Added');
    const r3 = listPlaylist('Chill');
    expect(r3).toContain('Track A');
  });

  it('formats weather nicely', () => {
    const w: WeatherResult = { location: 'London', temperature: 15, unit: '°C', description: 'partly cloudy', forecast: 'High 18°, low 10°' };
    const s = formatWeather(w);
    expect(s).toContain('15°C');
    expect(s).toContain('London');
  });

  it('formats news headlines', () => {
    const items: NewsItem[] = [{ title: 'Test headline' }];
    const s = formatNews(items);
    expect(s).toContain('Test headline');
  });
});
