import { describe, it, expect } from 'vitest';
import { safeCalculate, formatResult } from '../src/workspace/jarvis/voice/kevo-calc';
import { parseWeatherRequest } from '../src/workspace/jarvis/voice/kevo-weather';

describe('Kevo new features', () => {
  it('calculates basic math', () => {
    expect(safeCalculate('2 + 2')).toBe(4);
    expect(safeCalculate('15 percent of 200')).toBe(30);
    expect(formatResult(3.14159)).toBe('3.14');
  });

  it('parses weather place', () => {
    expect(parseWeatherRequest('weather in london')).toBe('london');
    expect(parseWeatherRequest('forecast for nairobi')).toBe('nairobi');
  });
});
