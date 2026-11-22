import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatWhatsPlaying } from '../src/workspace/jarvis/voice/kevo-whats-playing';

describe('kevo whats playing', () => {
  it('formats a full track', () => {
    const s = formatWhatsPlaying({ title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera' });
    assert.ok(s.includes('Bohemian Rhapsody'));
    assert.ok(s.includes('Queen'));
    assert.ok(s.includes('A Night at the Opera'));
  });

  it('handles nothing playing', () => {
    const s = formatWhatsPlaying(null);
    assert.ok(s.includes('Nothing is playing'));
  });
});
