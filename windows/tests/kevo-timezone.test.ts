import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimezoneRequest, timeInPlace } from '../src/workspace/jarvis/voice/kevo-timezone';

describe('Kevo timezone time', () => {
  it('parses "what time is it in Tokyo"', () => {
    assert.equal(parseTimezoneRequest('what time is it in tokyo'), 'tokyo');
    assert.equal(parseTimezoneRequest('time in london'), 'london');
    assert.equal(parseTimezoneRequest('what is the time in new york'), 'new york');
    assert.equal(parseTimezoneRequest('what time is it in tokyo right now?'), 'tokyo');
    assert.equal(parseTimezoneRequest('what time is it in atlantis'), 'atlantis');
    assert.equal(parseTimezoneRequest('what time is it'), null);
  });

  it('returns a spoken time for a known place', () => {
    const reply = timeInPlace('tokyo', new Date('2026-11-22T12:00:00Z'));
    assert.ok(reply && reply.includes('Tokyo'));
    assert.ok(reply && /\d{1,2}:\d{2}/.test(reply));
  });

  it('returns null for an unknown place', () => {
    assert.equal(timeInPlace('atlantis'), null);
  });
});
