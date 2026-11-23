import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchAudiusTracks, formatAudiusResults } from '../src/workspace/jarvis/voice/audius-search';

describe('audius-search', () => {
  it('returns empty for empty query', async () => {
    assert.deepEqual(await searchAudiusTracks(''), []);
    assert.deepEqual(await searchAudiusTracks('   '), []);
  });

  it('formats results for speech', () => {
    const tracks = [
      { id: '1', title: 'Test Song', artist: 'Artist' },
      { id: '2', title: 'Another', artist: 'Other' },
    ];
    assert.ok(formatAudiusResults(tracks).includes('Test Song by Artist'));
    assert.equal(formatAudiusResults([]), 'No tracks found on Audius.');
  });

  it('handles network failure softly', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('network'))) as typeof fetch;
    try {
      assert.deepEqual(await searchAudiusTracks('test'), []);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
