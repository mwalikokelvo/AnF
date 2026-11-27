import { describe, it, expect } from 'vitest';
import { isNewsRequest, topNews } from '../src/workspace/jarvis/voice/kevo-news';
import { isHolidayRequest } from '../src/workspace/jarvis/voice/kevo-holidays';
import { isAdvancedCalcRequest, advancedCalc } from '../src/workspace/jarvis/voice/kevo-advanced-calc';

describe('Kevo news, holidays, advanced calc', () => {
  it('detects news requests', () => {
    expect(isNewsRequest('news')).toBe(true);
    expect(isNewsRequest('what is in the news')).toBe(true);
    expect(isNewsRequest('play music')).toBe(false);
  });

  it('detects holiday requests', () => {
    expect(isHolidayRequest('is today a holiday')).toEqual({ country: 'US', year: new Date().getFullYear() });
    expect(isHolidayRequest('holidays in GB')).toEqual({ country: 'GB', year: new Date().getFullYear() });
  });

  it('computes percentage offline', () => {
    const r = advancedCalc('what is 15 percent of 200');
    expect(r?.ok).toBe(true);
    expect(r?.speech).toContain('30');
  });

  it('computes BMI offline', () => {
    const r = advancedCalc('bmi for 70 kg and 175 cm');
    expect(r?.ok).toBe(true);
    expect(r?.speech).toMatch(/BMI is \d+\.\d/);
  });

  it('computes square root offline', () => {
    const r = advancedCalc('square root of 16');
    expect(r?.speech).toContain('4');
  });
});
