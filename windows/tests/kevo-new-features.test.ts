import { describe, it } from 'node:test';
import assert from 'node:assert';
import { daysUntil } from '../src/workspace/jarvis/voice/kevo-days-until';

describe('Kevo new features', () => {
  it('daysUntil returns positive days for future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const iso = future.toISOString().slice(0, 10);
    const result = daysUntil(iso);
    assert.match(result, /5 days until/);
  });

  it('daysUntil handles today', () => {
    const today = new Date().toISOString().slice(0, 10);
    assert.strictEqual(daysUntil(today), 'That is today.');
  });

  it('daysUntil rejects invalid date', () => {
    assert.match(daysUntil('not-a-date'), /valid date/);
  });
});
