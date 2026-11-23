import { describe, it, expect, vi } from 'vitest';
import { isNewsRequest, fetchHeadlines } from '../src/workspace/jarvis/voice/kevo-news';

describe('Kevo news', () => {
  it('detects news requests', () => {
    expect(isNewsRequest('news')).toBe(true);
    expect(isNewsRequest('headlines')).toBe(true);
    expect(isNewsRequest('what is in the news')).toBe(true);
    expect(isNewsRequest('tell me a joke')).toBe(false);
    expect(isNewsRequest('kevo, top stories please')).toBe(true);
  });

  it('formats headlines from a mock response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ title: 'Story one' }, { title: 'Story two' }] }),
    });
    const result = await fetchHeadlines(mockFetch);
    expect(result).toContain('Story one');
    expect(result).toContain('Story two');
  });
});
