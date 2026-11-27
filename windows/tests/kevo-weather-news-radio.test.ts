import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRadioQueue, type TrackMeta } from '../src/workspace/jarvis/voice/kevo-music-radio';
import { formatWeather, type WeatherResult } from '../src/workspace/jarvis/voice/kevo-weather';
import { formatNews, type NewsItem } from '../src/workspace/jarvis/voice/kevo-news';

describe('Kevo new capabilities', () => {
  it('builds radio queue preferring same artist', () => {
    const seed: TrackMeta = { id: '1', title: 'Song A', artist: 'Artist X', genre: 'rock' };
    const library: TrackMeta[] = [
      { id: '2', title: 'Song B', artist: 'Artist X', genre: 'pop' },
      { id: '3', title: 'Song C', artist: 'Other', genre: 'rock' },
      { id: '4', title: 'Song D', artist: 'Other', genre: 'jazz' },
    ];
    const q = buildRadioQueue(seed, library, 5);
    assert.ok(q.length >= 1);
    assert.equal(q[0].artist, 'Artist X'); // highest score first before shuffle, but after light shuffle may vary; check presence
    assert.ok(q.some(t => t.artist === 'Artist X'));
  });

  it('formats weather reply', () => {
    const w: WeatherResult = { location: 'London', temperature: 15, unit: '°C', condition: 'partly cloudy', windSpeed: 10 };
    const text = formatWeather(w);
    assert.match(text, /London/);
    assert.match(text, /15/);
    assert.match(text, /Open-Meteo/);
  });

  it('formats news list', () => {
    const items: NewsItem[] = [{ title: 'Test story', url: 'http://ex.com', source: 'HN', points: 100 }];
    const text = formatNews(items);
    assert.match(text, /Test story/);
    assert.match(text, /HN/);
  });
});
