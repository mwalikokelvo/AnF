/**
 * Kevo's speech: an answer that arrives sentence by sentence is one stretch of speech, and can be stopped.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisSpeaker } from '../src/workspace/jarvis/voice/jarvis-speaker';

const g = globalThis as any;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Kevo speech stream', () => {
  let spoken: string[];
  let finishCurrent: (() => void) | null;
  let saved: Record<string, unknown>;

  beforeEach(() => {
    spoken = [];
    finishCurrent = null;
    saved = { window: g.window, SpeechSynthesisUtterance: g.SpeechSynthesisUtterance };
    g.SpeechSynthesisUtterance = class { onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} };
    g.window = {
      speechSynthesis: {
        getVoices: () => [{ name: 'Test', lang: 'en-US', localService: true }],
        cancel: () => { finishCurrent = null; },
        speak: (u: any) => { spoken.push(u.text); finishCurrent = () => u.onend?.(); },
        addEventListener() {}, removeEventListener() {},
      },
    };
  });
  afterEach(() => { g.window = saved.window; g.SpeechSynthesisUtterance = saved.SpeechSynthesisUtterance; });

  it('speaks sentences as they arrive, as one stretch of speech', async () => {
    const events: string[] = [];
    const speaker = new JarvisSpeaker({ onStart: () => events.push('start'), onEnd: () => events.push('end') });
    const stream = speaker.beginStream();
    stream.push('First sentence.');
    await tick();
    assert.deepEqual(spoken, ['First sentence.'], 'speech starts before the answer is complete');
    finishCurrent!();
    await tick();
    assert.deepEqual(events, ['start'], 'waiting for the next sentence is not the end of the reply');
    stream.push('Second sentence.');
    await tick();
    finishCurrent!();
    const done = stream.end();
    await done;
    assert.deepEqual(spoken, ['First sentence.', 'Second sentence.']);
    assert.deepEqual(events, ['start', 'end']);
  });

  it('stop ends a reply that is waiting for its next sentence', async () => {
    const events: string[] = [];
    const speaker = new JarvisSpeaker({ onStart: () => events.push('start'), onEnd: () => events.push('end') });
    const stream = speaker.beginStream();
    stream.push('Only sentence.');
    await tick();
    finishCurrent!();
    await tick();
    speaker.stop();
    stream.push('Too late.');
    await stream.end();
    assert.deepEqual(spoken, ['Only sentence.']);
    assert.deepEqual(events, ['start', 'end']);
    assert.equal(speaker.getIsSpeaking(), false);
  });
});
