import { getWeather } from '../src/workspace/jarvis/voice/weather';

describe('weather', () => {
  it('returns a string', async () => {
    const result = await getWeather();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
