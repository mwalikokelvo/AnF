import { describe, it, expect, vi } from 'vitest';
import { parseRssTitles, isNewsRequest } from '../src/workspace/jarvis/voice/kevo-news';
import { normalizeCoin, isCryptoRequest } from '../src/workspace/jarvis/voice/kevo-crypto';
import { isMusicRecommendRequest } from '../src/workspace/jarvis/voice/kevo-music-recommend';

describe('Kevo discovery features', () => {
  it('parses RSS titles and skips channel title', () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>BBC News</title><item><title>First headline</title></item><item><title>Second & more</title></item></channel></rss>`;
    const items = parseRssTitles(xml, 5);
    expect(items.map(i => i.title)).toEqual(['First headline', 'Second & more']);
  });

  it('detects news requests', () => {
    expect(isNewsRequest("what's the news")).toBe('world');
    expect(isNewsRequest('tech headlines please')).toBe('tech');
    expect(isNewsRequest('hello')).toBeNull();
  });

  it('normalises known coins', () => {
    expect(normalizeCoin('BTC')).toBe('bitcoin');
    expect(normalizeCoin('ethereum')).toBe('ethereum');
    expect(normalizeCoin('unknown')).toBeNull();
  });

  it('detects crypto price requests', () => {
    expect(isCryptoRequest('price of bitcoin')).toBe('bitcoin');
    expect(isCryptoRequest('how much is eth')).toBe('eth');
    expect(isCryptoRequest('weather')).toBeNull();
  });

  it('detects music recommend requests', () => {
    expect(isMusicRecommendRequest('artists like radiohead')).toBe('radiohead');
    expect(isMusicRecommendRequest('similar to the beatles')).toBe('the beatles');
    expect(isMusicRecommendRequest('play music')).toBeNull();
  });
});
