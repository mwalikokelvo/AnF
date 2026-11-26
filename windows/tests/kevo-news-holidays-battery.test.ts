import { describe, it, expect } from 'vitest';
import { isNewsRequest } from '../src/workspace/jarvis/voice/kevo-news';
import { parseHolidayRequest } from '../src/workspace/jarvis/voice/kevo-holidays';
import { isBatteryRequest, isDiskRequest } from '../src/workspace/jarvis/voice/kevo-system';

describe('Kevo new capabilities', () => {
  it('detects news requests', () => {
    expect(isNewsRequest("what's the news")).toBe(true);
    expect(isNewsRequest('top headlines')).toBe(true);
    expect(isNewsRequest('play music')).toBe(false);
  });

  it('parses holiday requests', () => {
    expect(parseHolidayRequest('what holidays')).not.toBeNull();
    expect(parseHolidayRequest('holidays in kenya')?.country).toBe('KE');
    expect(parseHolidayRequest('tell me a joke')).toBeNull();
  });

  it('detects system status requests', () => {
    expect(isBatteryRequest("how's the battery")).toBe(true);
    expect(isDiskRequest('how much disk space')).toBe(true);
    expect(isBatteryRequest('what time is it')).toBe(false);
  });
});
