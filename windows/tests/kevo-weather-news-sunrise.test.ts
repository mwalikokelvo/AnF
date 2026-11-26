import { describe, it, expect, vi } from 'vitest';
import { fetchWeather, formatWeather, conditionFromCode } from '../src/workspace/jarvis/voice/kevo-weather';
import { fetchHeadlines, formatHeadlines } from '../src/workspace/jarvis/voice/kevo-news';
import { fetchSunTimes, formatSunTimes } from '../src/workspace/jarvis/voice/kevo-sunrise';

describe('Kevo weather / news / sunrise', () => {
  it('maps weather codes', () => {
    expect(conditionFromCode(0)).toBe('clear');
    expect(conditionFromCode(999)).toBe('mixed conditions');
  });

  it('formats weather', () => {
    expect(formatWeather({ place: 'Nairobi', tempC: 22.4, condition: 'partly cloudy', windKmh: 12 })).toContain('Nairobi');
  });

  it('formats headlines', () => {
    expect(formatHeadlines(['One', 'Two'])).toContain('1. One');
  });

  it('formats sun times', () => {
    expect(formatSunTimes({ place: 'London', sunrise: '07:12', sunset: '16:45' })).toContain('07:12');
  });

  // Network calls are mocked in real CI; here we only check the pure helpers.
});
