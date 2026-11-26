import { describe, it, expect, vi } from 'vitest';
import { isNewsRequest, fetchHeadlines } from '../src/workspace/jarvis/voice/kevo-news';
import { isFocusStart, startFocus, focusStatus, cancelFocus } from '../src/workspace/jarvis/voice/kevo-focus';
import { isBatteryRequest } from '../src/workspace/jarvis/voice/kevo-battery';

describe('Kevo news, focus, battery', () => {
  it('detects news requests', () => {
    expect(isNewsRequest("what's the news")).toBe(true);
    expect(isNewsRequest('headlines')).toBe(true);
    expect(isNewsRequest('play music')).toBe(false);
  });

  it('starts and reports focus', () => {
    const start = isFocusStart('start focus');
    expect(start).toEqual({ minutes: 25, label: 'focus' });
    const s = startFocus(1, 'test');
    expect(s.label).toBe('test');
    expect(focusStatus()).toMatch(/1 minute/);
    cancelFocus();
    expect(focusStatus()).toMatch(/No focus/);
  });

  it('detects battery requests', () => {
    expect(isBatteryRequest("how's the battery")).toBe(true);
    expect(isBatteryRequest('weather')).toBe(false);
  });
});
