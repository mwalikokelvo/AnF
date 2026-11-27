import { describe, it, expect } from 'vitest';
import { isNewsRequest, formatHeadlines } from './kevo-news';
import { isAirQualityRequest } from './kevo-air';

describe('kevo-news', () => {
  it('detects news requests', () => {
    expect(isNewsRequest("what's in the news")).toBe(true);
    expect(isNewsRequest('top headlines')).toBe(true);
    expect(isNewsRequest('play music')).toBe(false);
  });
  it('formats headlines', () => {
    expect(formatHeadlines(['A', 'B'])).toContain('1. A');
    expect(formatHeadlines([])).toContain('could not get');
  });
});

describe('kevo-air', () => {
  it('detects air quality requests', () => {
    expect(isAirQualityRequest("how's the air quality")).toBe(true);
    expect(isAirQualityRequest('air quality in Nairobi')).toBe(true);
  });
});
