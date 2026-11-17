/**
 * Kevo Phase 0 step 0.2: the phrase list (`kevo-phrases.json`) run through `JarvisVoiceAgent` with fake actions.
 * Each entry gets a fresh agent. `before` (optional) lists what was said just before it, for follow-ups.
 * Owner phrases (sessions 1-3) must all pass; variants at least 90%. Failing variants are real gaps, kept on purpose.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { clearJarvisHistory } from '../src/workspace/jarvis/voice/jarvis-memory';

type Phrase = { say: string; expect: string; source: 'session 1' | 'session 2' | 'session 3' | 'variant'; before?: string[] };

const PHRASES = JSON.parse(readFileSync(new URL('./kevo-phrases.json', import.meta.url), 'utf8')) as Phrase[];
const SOURCES = ['session 1', 'session 2', 'session 3', 'variant'] as const;
const VOICES = ['Nath', 'Burt', 'Kevo', 'Jean'];
/** Apps the fake computer does not have, so the "not found" follow-ups can be tried. */
const NOT_INSTALLED = /^(photoshop|bravo browser)$/i;

function freshAgent(): JarvisVoiceAgent {
  let at = 0;
  return new JarvisVoiceAgent({
    switchView: () => {},
    playMusic: () => {},
    pauseMusic: () => {},
    nextTrack: () => {},
    openQuickCapture: () => {},
    openApp: async (name) => {
      if (NOT_INSTALLED.test(name)) throw new Error(`I could not find an app called ${name} in the Start Menu.`);
      return name;
    },
    openUrl: async () => {},
    searchWeb: async () => {},
    searchMusic: async () => true,
    searchVault: async () => 'Found 1 note.',
    saveQuickNote: async () => {},
    askAI: async (q) => `An answer to: ${q}`,
    voiceNames: () => VOICES,
    changeVoice: (name) => (name ? VOICES.find((v) => v.toLowerCase() === name) ?? null : VOICES[(at = (at + 1) % VOICES.length)]),
    announce: () => {},
  });
}

async function actionFor(phrase: Phrase): Promise<string> {
  clearJarvisHistory();
  const agent = freshAgent();
  try {
    for (const earlier of phrase.before ?? []) await agent.processVoiceInput(earlier);
    return (await agent.processVoiceInput(phrase.say)).actionName;
  } finally {
    agent.dispose(); // timers set by a phrase must not keep the test running
    clearJarvisHistory();
  }
}

describe('Kevo phrase list', () => {
  it('is well formed, with at least 60 variants', () => {
    for (const p of PHRASES) {
      assert.ok(typeof p.say === 'string' && p.say.trim(), JSON.stringify(p));
      assert.match(p.expect, /^[a-z_]+(\+[a-z_]+)*$/, JSON.stringify(p));
      assert.ok((SOURCES as readonly string[]).includes(p.source), JSON.stringify(p));
    }
    assert.ok(PHRASES.filter((p) => p.source === 'variant').length >= 60);
    for (const source of SOURCES.slice(0, 3)) assert.ok(PHRASES.some((p) => p.source === source), source);
  });

  it('owner phrases pass 100%, variants at least 90%', async () => {
    const failures: Record<string, string[]> = {};
    const lines: string[] = [];
    for (const source of SOURCES) {
      const group = PHRASES.filter((p) => p.source === source);
      failures[source] = [];
      for (const p of group) {
        const got = await actionFor(p);
        if (got !== p.expect) failures[source].push(`"${p.say}": expected ${p.expect}, got ${got}`);
      }
      const passed = group.length - failures[source].length;
      lines.push(`${source}: ${passed}/${group.length} (${((100 * passed) / group.length).toFixed(1)}%)`);
    }
    console.log(`Kevo phrase list pass rate\n  ${lines.join('\n  ')}`);
    if (failures.variant.length) console.log(`Variants Kevo does not handle yet:\n  ${failures.variant.join('\n  ')}`);

    const owner = [...failures['session 1'], ...failures['session 2'], ...failures['session 3']];
    assert.deepEqual(owner, [], 'every owner phrase from sessions 1-3 must pass');
    const variants = PHRASES.filter((p) => p.source === 'variant').length;
    assert.ok((variants - failures.variant.length) / variants >= 0.9, `variants below 90%:\n${failures.variant.join('\n')}`);
  });
});
