import { describe, it, expect, vi } from 'vitest';
import { searchAudiusTracks, formatAudiusResults } from '../src/workspace/jarvis/voice/audius-search';

describe('audius-search', () => {
  it('returns empty for empty query', async () => {
    expect(await searchAudiusTracks('')).toEqual([]);
    expect(await searchAudiusTracks('   ')).toEqual([]);
  });

  it('formats results for speech', () => {
    const tracks = [
      { id: '1', title: 'Test Song', artist: 'Artist' },
      { id: '2', title: 'Another', artist: 'Other' },
    ];
    expect(formatAudiusResults(tracks)).toContain('Test Song by Artist');
    expect(formatAudiusResults([])).toBe('No tracks found on Audius.');
  });

  it('handles network failure softly', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network')));
    expect(await searchAudiusTracks('test')).toEqual([]);
    vi.unstubAllGlobals();
  });
});
