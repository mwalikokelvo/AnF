import { describe, it, expect, vi } from 'vitest';
import { getWeather } from '../src/workspace/jarvis/voice/kevo-weather';
import { getTopNews } from '../src/workspace/jarvis/voice/kevo-news';
import { getCryptoPrice } from '../src/workspace/jarvis/voice/kevo-crypto';

describe('Kevo weather / news / crypto', () => {
  it('asks for a location when none is given', async () => {
    const reply = await getWeather('');
    expect(reply).toMatch(/which city/i);
  });

  it('returns a friendly failure message when news cannot be fetched', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));
    const reply = await getTopNews();
    expect(reply).toMatch(/could not fetch the news/i);
    spy.mockRestore();
  });

  it('asks which coin when none is given', async () => {
    const reply = await getCryptoPrice('');
    expect(reply).toMatch(/which coin/i);
  });
});
