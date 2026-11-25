import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SpeculativeDecodingEngine } from '../src/workspace/ai/speculative-decoding';

describe('Speculative Decoding Engine (MiniMind + Magnitude)', () => {
  it('accelerates token generation when draft model predictions are accepted', async () => {
    // Mock draft model: predicts predictable sequence words
    const mockDraft = async (prefix: string[], count: number) => {
      const bank = ['local-first', 'software', 'guarantees', 'privacy', 'and', 'speed', 'always'];
      const next: string[] = [];
      for (let i = 0; i < count; i++) {
        next.push(bank[(prefix.length + i) % bank.length]);
      }
      return next;
    };

    // Mock target verifier: accepts 3 out of 4 tokens, then corrects 1
    const mockVerifier = async (_prefix: string[], candidates: string[]) => {
      const acceptedCount = Math.min(candidates.length, 3);
      const correctionToken = 'sovereignty';
      return { acceptedCount, correctionToken };
    };

    const engine = new SpeculativeDecodingEngine(mockDraft, mockVerifier, 4);
    const res = await engine.generate(['The'], 12);

    assert.ok(res.tokens.length >= 10);
    assert.ok(res.text.includes('sovereignty'));
    const metrics = engine.getMetrics();
    assert.ok(metrics.acceptedTokens > 0);
    assert.ok(metrics.acceptanceRate >= 0.7);
    assert.ok(metrics.effectiveSpeedup > 1.5);
  });
});
