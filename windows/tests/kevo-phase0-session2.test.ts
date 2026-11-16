/**
 * Kevo Phase 0, second run on the PC (0.1.54): the requests that failed in the owner's recording.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisVoiceAgent, splitRequests, stripLeadIn, type JarvisActionContext } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { JarvisVoiceListener } from '../src/workspace/jarvis/voice/jarvis-voice-listener';
import { clearJarvisHistory } from '../src/workspace/jarvis/voice/jarvis-memory';

function agentWith(extra: Partial<JarvisActionContext> = {}) {
  const opened: string[] = [];
  const urls: string[] = [];
  const asked: string[] = [];
  const agent = new JarvisVoiceAgent({
    switchView: () => {},
    openApp: async (name) => {
      opened.push(name);
      if (/^brave( browser)?$/i.test(name)) return 'Brave';
      throw new Error(`I could not find an app called ${name} in the Start Menu.`);
    },
    openUrl: async (url) => { urls.push(url); },
    askAI: async (q) => { asked.push(q); return 'An answer.'; },
    ...extra,
  });
  return { agent, opened, urls, asked };
}

describe('Kevo Phase 0 session 2', () => {
  beforeEach(() => clearJarvisHistory());

  it('polite lead-ins come off commands, not off questions', () => {
    assert.equal(stripLeadIn('In the meantime, can you open Brave browser and play YouTube?'), 'open Brave browser and play YouTube');
    assert.equal(stripLeadIn('I need you to open a Brave browser please.'), 'open a Brave browser.');
    assert.equal(stripLeadIn('Can you hear me?'), 'Can you hear me?');
    assert.equal(stripLeadIn('Could you explain how timers work?'), 'Could you explain how timers work?');
  });

  it('two commands joined by "and" are two requests; a name with "and" is one', () => {
    assert.deepEqual(splitRequests('open Brave browser and play YouTube'), ['open Brave browser', 'play YouTube']);
    assert.deepEqual(splitRequests('set a timer for five minutes, and then play music'), ['set a timer for five minutes', 'play music']);
    assert.deepEqual(splitRequests('play rock and roll'), ['play rock and roll']);
    assert.deepEqual(splitRequests('what is the difference between cats and dogs'), ['what is the difference between cats and dogs']);
  });

  it('"can you open Brave browser and play YouTube" opens both, without the AI', async () => {
    const { agent, opened, urls, asked } = agentWith();
    const r = await agent.processVoiceInput('In the meantime, can you open Brave browser and play YouTube?');
    assert.deepEqual(opened, ['Brave browser']);
    assert.deepEqual(urls, ['https://www.youtube.com']);
    assert.deepEqual(asked, []);
    assert.equal(r.speechReply, 'Opening Brave. Opening YouTube.');
  });

  it('"I need you to open a Brave browser" drops the "a"', async () => {
    const { agent, opened } = agentWith();
    await agent.processVoiceInput('I need you to open a Brave browser and play YouTube.');
    assert.deepEqual(opened, ['Brave browser']);
  });

  it('after an app is not found, its name alone opens it', async () => {
    const { agent, opened, asked } = agentWith();
    const miss = await agent.processVoiceInput('Open browser.');
    assert.match(miss.speechReply, /could not find/);
    const hit = await agent.processVoiceInput('Brave browser.');
    assert.equal(hit.speechReply, 'Opening Brave.');
    assert.deepEqual(opened, ['browser', 'Brave browser']);
    assert.deepEqual(asked, []);
  });

  it('"open it" opens what was just talked about', async () => {
    const { agent, opened } = agentWith();
    await agent.processVoiceInput('Brave browser.'); // answered by the AI
    const r = await agent.processVoiceInput('Open it.');
    assert.deepEqual(opened, ['Brave browser']);
    assert.equal(r.speechReply, 'Opening Brave.');
  });

  it('"open it" with nothing talked about asks which app', async () => {
    const { agent, opened } = agentWith();
    const r = await agent.processVoiceInput('open it');
    assert.equal(r.actionName, 'open_unclear');
    assert.deepEqual(opened, []);
  });

  it('"not Kevo" is the name misheard, and "what is your name" needs no AI', async () => {
    const { agent, asked } = agentWith();
    assert.equal((await agent.processVoiceInput('not Kevo.')).speechReply, 'Yes?');
    assert.equal((await agent.processVoiceInput('Just tell me what\'s your name?')).speechReply, 'My name is Kevo.');
    assert.deepEqual(asked, []);
  });

  it('a recognition network error turns the microphone off instead of showing "Say Kevo"', () => {
    const g = globalThis as any;
    const prev = g.window;
    let rec: any;
    g.window = { SpeechRecognition: class { start() { this.onstart?.(); } stop() { this.onend?.(); } abort() {} onstart: any; onend: any; constructor() { rec = this; } } };
    try {
      const states: boolean[] = [];
      const errors: string[] = [];
      const listener = new JarvisVoiceListener({ onListeningStateChange: (s) => states.push(s), onError: (e) => errors.push(e) });
      assert.equal(listener.start(), true);
      rec.onerror({ error: 'network' });
      assert.equal(listener.getListeningState(), false);
      assert.deepEqual(states, [true, false]);
      assert.match(errors[0], /could not reach the internet/);
    } finally {
      g.window = prev;
    }
  });
});
