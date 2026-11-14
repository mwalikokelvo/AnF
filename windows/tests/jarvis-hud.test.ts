/**
 * Kevo stage: which state the orb shows. (The DOM and motion are checked by scripts/app-qa/jarvis-layout.mjs.)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { kevoState } from '../src/workspace/jarvis/jarvis-hud';

describe('Kevo orb state', () => {
  const s = (o: Partial<Parameters<typeof kevoState>[0]>) => kevoState({ micOn: true, awake: false, thinking: false, speaking: false, ...o });
  it('is off without the microphone and waits for its name with it', () => {
    assert.equal(s({ micOn: false }), 'off');
    assert.equal(s({}), 'idle');
  });
  it('listens once called, then thinks, then speaks', () => {
    assert.equal(s({ awake: true }), 'listening');
    assert.equal(s({ awake: true, thinking: true }), 'thinking');
    assert.equal(s({ awake: true, thinking: true, speaking: true }), 'speaking');
  });
  it('still shows a reply being spoken after the microphone is turned off', () => {
    assert.equal(s({ micOn: false, speaking: true }), 'speaking');
  });
});
