/**
 * Kevo stage: which state the orb shows. (The DOM and motion are checked by scripts/app-qa/jarvis-layout.mjs.)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { floatShown, kevoHudReporter, kevoState, setFloatShown } from '../src/workspace/jarvis/jarvis-hud';

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

describe('Kevo state sent to the float HUD', () => {
  it('calls kevo_hud_set exactly once for each change of kevoState()', async () => {
    const calls: unknown[] = [];
    const report = kevoHudReporter(async (cmd, args) => { calls.push([cmd, args.state]); });
    const s = (o: Partial<Parameters<typeof kevoState>[0]>) => kevoState({ micOn: true, awake: false, thinking: false, speaking: false, ...o });
    // The desk refreshes on every listener and speaker callback, so the same state is often computed again.
    for (const o of [{ micOn: false }, { micOn: false }, {}, {}, { awake: true }, { awake: true, thinking: true }, { thinking: true },
      { speaking: true }, { speaking: true }, { awake: true }, { awake: true }, {}, { micOn: false }]) report(s(o));
    assert.deepEqual(calls, [
      ['kevo_hud_set', 'off'], ['kevo_hud_set', 'idle'], ['kevo_hud_set', 'listening'], ['kevo_hud_set', 'thinking'],
      ['kevo_hud_set', 'speaking'], ['kevo_hud_set', 'listening'], ['kevo_hud_set', 'idle'], ['kevo_hud_set', 'off'],
    ]);
  });
  it('keeps working when there is no Tauri to call', async () => {
    let n = 0;
    const report = kevoHudReporter(() => { n++; return Promise.reject(new Error('no Tauri')); });
    report('idle');
    report('listening');
    await new Promise((r) => setImmediate(r));
    assert.equal(n, 2);
  });
});

describe('"Show Kevo float" setting', () => {
  it('is on by default, is remembered, and tells Rust each choice', () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    try {
      assert.equal(floatShown(), true, 'on by default');
      const calls: unknown[] = [];
      const invoke = async (cmd: string, args: { show: boolean }) => { calls.push([cmd, args.show]); };
      setFloatShown(false, invoke);
      assert.equal(floatShown(), false);
      setFloatShown(true, invoke);
      assert.equal(floatShown(), true);
      assert.deepEqual(calls, [['kevo_float_show', false], ['kevo_float_show', true]]);
    } finally { delete (globalThis as any).localStorage; }
  });
  it('still works with no storage and no Tauri', async () => {
    assert.equal(floatShown(), true);
    setFloatShown(false, () => Promise.reject(new Error('no Tauri')));
    await new Promise((r) => setImmediate(r));
  });
});
