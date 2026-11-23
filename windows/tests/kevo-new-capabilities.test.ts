import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translateText } from '../src/workspace/jarvis/voice/kevo-translate';
import { worldTime, formatWorldTime } from '../src/workspace/jarvis/voice/kevo-world-time';
import { flipCoin, randomNumber, randomChoice } from '../src/workspace/jarvis/voice/kevo-random';

describe('Kevo new capabilities', () => {
  it('worldTime returns a time string for known cities', () => {
    const t = worldTime('tokyo');
    assert.ok(t && /\d/.test(t));
  });

  it('formatWorldTime works', () => {
    assert.ok(formatWorldTime('London', '3:00 PM').includes('London'));
  });

  it('flipCoin returns heads or tails', () => {
    const r = flipCoin();
    assert.ok(r === 'heads' || r === 'tails');
  });

  it('randomNumber is in range', () => {
    const n = randomNumber(1, 5);
    assert.ok(n >= 1 && n <= 5);
  });

  it('randomChoice picks from list', () => {
    const c = randomChoice(['a', 'b']);
    assert.ok(c === 'a' || c === 'b');
  });

  // Translation test would require network; mock in real suite
  it('translateText rejects empty', async () => {
    const r = await translateText('');
    assert.equal(r, null);
  });
});
