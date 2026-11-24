/**
 * Kevo Command Palette Tests (AnF -> Kevo).
 * Verifies that the global Ctrl/Cmd+K command palette exposes a Kevo command group that routes
 * through the same JarvisActionContext the voice agent uses.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { kevoCommands, type PaletteCommand } from '../src/workspace/kevo-commands';
import type { JarvisActionContext } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

interface ContextCalls {
  switchViews: string[];
  playsMusic: number;
  pausesMusic: number;
  nextTracks: number;
  previousTracks: number;
}

function makeContext(): { ctx: JarvisActionContext; calls: ContextCalls } {
  const calls: ContextCalls = { switchViews: [], playsMusic: 0, pausesMusic: 0, nextTracks: 0, previousTracks: 0 };
  const ctx = {
    switchView: (view: string) => { calls.switchViews.push(view); },
    playMusic: () => { calls.playsMusic++; },
    pauseMusic: () => { calls.pausesMusic++; },
    nextTrack: () => { calls.nextTracks++; },
    previousTrack: () => { calls.previousTracks++; },
  } as JarvisActionContext;
  return { ctx, calls };
}

describe('Kevo Command Palette', () => {
  it('exposes the Kevo command group', () => {
    const { ctx } = makeContext();
    const commands = kevoCommands(ctx);
    const labels = commands.map((c) => c.label);
    for (const expected of ['Kevo · play music', 'Kevo · pause music', 'Kevo · next track', 'Kevo · previous track', 'Kevo · open Music Hub', 'Kevo · open Kevo desk']) {
      assert.ok(labels.includes(expected), `missing command: ${expected}`);
    }
  });

  it('routes music commands through the action context', () => {
    const { ctx, calls } = makeContext();
    const byLabel = new Map<string, PaletteCommand>(kevoCommands(ctx).map((c) => [c.label, c]));
    byLabel.get('Kevo · play music')!.run();
    byLabel.get('Kevo · pause music')!.run();
    byLabel.get('Kevo · next track')!.run();
    byLabel.get('Kevo · previous track')!.run();
    assert.equal(calls.playsMusic, 1);
    assert.equal(calls.pausesMusic, 1);
    assert.equal(calls.nextTracks, 1);
    assert.equal(calls.previousTracks, 1);
  });

  it('routes view commands through the context switchView', () => {
    const { ctx, calls } = makeContext();
    const byLabel = new Map<string, PaletteCommand>(kevoCommands(ctx).map((c) => [c.label, c]));
    byLabel.get('Kevo · open Music Hub')!.run();
    byLabel.get('Kevo · open Kevo desk')!.run();
    assert.deepEqual(calls.switchViews, ['music', 'jarvis']);
  });

  it('is safe without a context', () => {
    const commands = kevoCommands({} as JarvisActionContext);
    assert.ok(commands.length > 0);
    for (const c of commands) {
      assert.doesNotThrow(() => c.run());
    }
  });
});
