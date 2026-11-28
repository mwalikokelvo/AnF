/**
 * Basic tests for new Kevo weather, discover and focus features.
 * Run with the project's test runner.
 */

import { getWeather, formatWeather } from '../src/workspace/jarvis/voice/kevo-weather';
import { recommendSimilar, formatRecommendations } from '../src/workspace/jarvis/voice/kevo-discover';
import { startFocus, getFocusStatus, cancelFocus } from '../src/workspace/jarvis/voice/kevo-focus';

// Note: network calls in getWeather may be mocked in full CI.
describe('Kevo new capabilities', () => {
  it('formats weather result', () => {
    const result = { location: 'London', current: '15°C', forecast: 'High 18', source: 'Open-Meteo' };
    expect(formatWeather(result)).toContain('London');
  });

  it('starts and cancels focus', () => {
    const start = startFocus(1);
    expect(start).toContain('Focus session started');
    expect(getFocusStatus()).toContain('active');
    expect(cancelFocus()).toContain('cancelled');
    expect(getFocusStatus()).toContain('No active');
  });

  it('formats recommendations', async () => {
    // Mock or skip real network
    const recs = await recommendSimilar('jazz', 1);
    expect(formatRecommendations(recs).length).toBeGreaterThan(0);
  });
});
