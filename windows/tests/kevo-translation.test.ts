import { describe, it, expect, vi } from 'vitest';
import { translateText, formatTranslation } from '../src/workspace/jarvis/voice/kevo-translation';

describe('Kevo Translation', () => {
  it('formats translation reply', () => {
    const reply = formatTranslation('Hello', 'Hola', 'en', 'es');
    expect(reply).toContain('Hola');
    expect(reply).toContain('es');
  });

  it('handles empty text', async () => {
    await expect(translateText('', 'en', 'es')).rejects.toThrow('Empty text');
  });

  it('calls MyMemory API on valid input (mocked)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        responseStatus: 200,
        responseData: { translatedText: 'Hola' },
      }),
    });
    const result = await translateText('Hello', 'en', 'es');
    expect(result).toBe('Hola');
    expect(global.fetch).toHaveBeenCalled();
  });
});
