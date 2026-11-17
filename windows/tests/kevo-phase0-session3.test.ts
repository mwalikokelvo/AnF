/**
 * Kevo Phase 0, third run on the PC (0.1.55): the requests from the owner's recording that failed.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisVoiceAgent, type JarvisActionContext } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { JarvisVoiceListener } from '../src/workspace/jarvis/voice/jarvis-voice-listener';
import { appendJarvisTurn, clearJarvisHistory } from '../src/workspace/jarvis/voice/jarvis-memory';

const VOICES = ['Nath', 'Burt', 'Kevo', 'Jean'];

function agentWith(extra: Partial<JarvisActionContext> = {}) {
  const opened: string[] = [];
  const urls: string[] = [];
  const asked: string[] = [];
  const voices: (string | undefined)[] = [];
  let at = 0;
  const agent = new JarvisVoiceAgent({
    switchView: () => {},
    openApp: async (name) => { opened.push(name); return 'Brave'; },
    openUrl: async (url) => { urls.push(url); },
    searchMusic: async () => true,
    askAI: async (q) => { asked.push(q); return 'An answer.'; },
    voiceNames: () => VOICES,
    changeVoice: (name) => {
      voices.push(name);
      if (!name) return VOICES[(at = (at + 1) % VOICES.length)];
      return VOICES.find((v) => v.toLowerCase() === name) ?? null;
    },
    ...extra,
  });
  return { agent, opened, urls, asked, voices };
}

describe('Kevo Phase 0 session 3', () => {
  beforeEach(() => clearJarvisHistory());

  it('"Which task can you do?" and "What task can you do?" get the help answer, not the AI', async () => {
    const { agent, asked } = agentWith();
    for (const q of ['Which task can you do?', 'What task can you do?', 'What kind of things can you help me with?', 'What are you able to do?']) {
      assert.equal((await agent.processVoiceInput(q)).actionName, 'help', q);
    }
    assert.deepEqual(asked, []);
    // Still a question for the AI:
    await agent.processVoiceInput('What can I do to fix this?');
    assert.equal(asked.length, 1);
  });

  it('"change your voice to another one" changes it, and "just pick any" right after changes it again', async () => {
    const { agent, asked, voices } = agentWith();
    const r = await agent.processVoiceInput("Let's start by changing your voice. Can you change your voice to another one?");
    assert.equal(r.speechReply, 'Voice changed to Burt. This is how I sound now.');
    assert.equal((await agent.processVoiceInput('With you, so just pick any.')).actionName, 'voice_changed');
    assert.equal((await agent.processVoiceInput('any other voice')).actionName, 'voice_changed');
    assert.deepEqual(voices, [undefined, undefined, undefined]);
    assert.deepEqual(asked, []);
  });

  it('a named voice is chosen by name; an unknown name says so', async () => {
    const { agent, voices } = agentWith();
    assert.equal((await agent.processVoiceInput('change your voice to Jean')).speechReply, 'Voice changed to Jean. This is how I sound now.');
    assert.equal((await agent.processVoiceInput('switch your voice to the Zed voice')).actionName, 'voice_unknown');
    assert.deepEqual(voices, ['jean', 'zed']);
    assert.match((await agent.processVoiceInput('What voices do you have?')).speechReply, /Nath, Burt, Kevo, Jean/);
  });

  it('a question about changing a voice elsewhere still goes to the AI', async () => {
    const { agent, asked, voices } = agentWith();
    await agent.processVoiceInput('How do I change the voice on my phone?');
    assert.deepEqual(voices, []);
    assert.equal(asked.length, 1);
  });

  it('"Open browser, Brave browser and play YouTube" opens YouTube once, with no second browser window', async () => {
    const { agent, opened, urls } = agentWith();
    const r = await agent.processVoiceInput('Open browser, Brave browser and play YouTube.');
    assert.deepEqual(opened, []);
    assert.deepEqual(urls, ['https://www.youtube.com']);
    assert.equal(r.speechReply, 'Opening YouTube.');
  });

  it('"Open brave browser and play any song in youtube" searches YouTube, not Music Hub', async () => {
    let musicHub = 0;
    const { agent, opened, urls } = agentWith({ searchMusic: async () => { musicHub++; return true; } });
    const r = await agent.processVoiceInput('Open brave browser and play any song in youtube.');
    assert.equal(musicHub, 0);
    assert.deepEqual(opened, []);
    assert.deepEqual(urls, ['https://www.youtube.com/results?search_query=popular%20songs']);
    assert.equal(r.speechReply, 'Searching YouTube for popular songs.');
    await agent.processVoiceInput('play Adele hello on YouTube');
    assert.equal(urls[1], 'https://www.youtube.com/results?search_query=adele%20hello');
  });

  it('opening a browser with something that is not a web page still opens the browser', async () => {
    const { agent, opened } = agentWith();
    await agent.processVoiceInput('Open browser, Brave browser.');
    assert.deepEqual(opened, ['browser, Brave browser']);
  });

  it('questions about the microphone and not being heard are answered without the AI', async () => {
    const { agent, asked } = agentWith();
    for (const q of [
      'Can you keep the microphone on?',
      'Hey Kevo, why can\'t you respond to my voice commands anymore?',
      'Why did you go silent? I have noticed that in all the tests we have done',
    ]) {
      assert.equal((await agent.processVoiceInput(q)).actionName, 'mic_help', q);
    }
    assert.deepEqual(asked, []);
    await agent.processVoiceInput('Why do you think people answer emails late?');
    assert.equal(asked.length, 1);
  });

  it('a stuck answer is asked once more with no history before giving up', async () => {
    appendJarvisTurn('user', 'Ok, well that was a movie playing.');
    appendJarvisTurn('assistant', 'OK, well that was a movie playing.');
    const histories: number[] = [];
    const { agent } = agentWith({
      askAI: async (_q, o) => { histories.push(o?.history.length ?? -1); return histories.length === 1 ? 'OK, well that was a movie playing.' : 'Black holes are very dense.'; },
    });
    const r = await agent.processVoiceInput('Tell me about black holes.');
    assert.deepEqual(histories, [2, 0]);
    assert.equal(r.speechReply, 'Black holes are very dense.');
  });

  it('typing "Cave diving is fun" keeps its first word', async () => {
    const { agent, asked } = agentWith();
    await agent.processVoiceInput('Cave diving is fun');
    assert.deepEqual(asked, ['Cave diving is fun']);
  });
});

describe('Kevo listener, session 3', () => {
  function fakeRecogniser() {
    const g = globalThis as any;
    const prev = g.window;
    const box: { rec: any } = { rec: null };
    g.window = { SpeechRecognition: class { start() { this.onstart?.(); } stop() { this.onend?.(); } abort() {} onstart: any; onend: any; constructor() { box.rec = this; } } };
    return { box, restore: () => { g.window = prev; } };
  }
  const interim = (text: string) => ({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: false })] });
  const final = (text: string) => ({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('words the recogniser shows but never confirms ("any other voice") are still acted on, once', async () => {
    const { box, restore } = fakeRecogniser();
    try {
      const heard: string[] = [];
      const listener = new JarvisVoiceListener({ settleMs: 10, onFinalSpeech: (t) => heard.push(t) });
      listener.start(); // the mic tap opens the follow-up window
      box.rec.onresult(interim('any other voice'));
      await wait(1500);
      assert.deepEqual(heard, ['any other voice']);
      box.rec.onresult(final('any other voice')); // a late confirmation does not run it again
      await wait(50);
      assert.deepEqual(heard, ['any other voice']);
      listener.stop();
    } finally {
      restore();
    }
  });

  it('talking keeps the follow-up window open', async () => {
    const { box, restore } = fakeRecogniser();
    try {
      const heard: string[] = [];
      const listener = new JarvisVoiceListener({ settleMs: 10, followUpMs: 200, onFinalSpeech: (t) => heard.push(t) });
      listener.start();
      await wait(120);
      box.rec.onresult(interim('change your'));
      await wait(150); // past the first window
      box.rec.onresult(final('change your voice'));
      await wait(50);
      assert.deepEqual(heard, ['change your voice']);
      listener.stop();
    } finally {
      restore();
    }
  });
});

describe('Kevo session 3 review fixes', () => {
  beforeEach(() => clearJarvisHistory());
  const agentFor = () => {
    const opened: string[] = [];
    const urls: string[] = [];
    const asked: string[] = [];
    const voices: (string | undefined)[] = [];
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      openApp: async (n) => { opened.push(n); return 'Brave'; },
      openUrl: async (u) => { urls.push(u); },
      searchMusic: async () => true,
      searchVault: async () => 'Found it.',
      askAI: async (q) => { asked.push(q); return `An answer to ${q}`; },
      changeVoice: (n) => { voices.push(n); return 'Burt'; },
    });
    return { agent, opened, urls, asked, voices };
  };

  it('a browser is still opened when the next request only mentions a site', async () => {
    const { agent, opened } = agentFor();
    await agent.processVoiceInput('Open Brave browser and play the YouTube soundtrack');
    await agent.processVoiceInput('open Brave and search my notes for Google');
    assert.deepEqual(opened, ['Brave browser', 'Brave']);
  });

  it('ordinary "why did you" questions reach the AI', async () => {
    const { agent, asked } = agentFor();
    await agent.processVoiceInput('Why did you answer that question incorrectly?');
    await agent.processVoiceInput('Why do you listen to jazz?');
    assert.equal(asked.length, 2);
    assert.equal((await agent.processVoiceInput('How come you stopped listening?')).actionName, 'mic_help');
  });

  it('"change the voice on my phone" does not change Kevo', async () => {
    const { agent, voices, asked } = agentFor();
    await agent.processVoiceInput('Can you change the voice on my phone?');
    assert.deepEqual(voices, []);
    assert.equal(asked.length, 1);
  });

  it('a long run of browser words is checked quickly (CodeQL: no exponential backtracking)', async () => {
    const t = Date.now();
    const { agent, opened } = agentFor();
    await agent.processVoiceInput('open edge' + '\tbrowser\tedge'.repeat(40) + '!x and play YouTube');
    assert.equal(opened.length, 1, 'not only browser words, so it is opened');
    assert.ok(Date.now() - t < 500);
  });
});

describe('Kevo listener review fixes', () => {
  function fake() {
    const g = globalThis as any;
    const prev = g.window;
    const box: { rec: any } = { rec: null };
    g.window = { SpeechRecognition: class { start() { this.onstart?.(); } stop() { this.onend?.(); } abort() {} onstart: any; onend: any; constructor() { box.rec = this; } } };
    return { box, restore: () => { g.window = prev; } };
  }
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const event = (...parts: [string, boolean][]) => ({ resultIndex: 0, results: parts.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f })) });

  it('a confirmed wake word with unconfirmed words after it still runs the words', async () => {
    const { box, restore } = fake();
    try {
      const heard: string[] = [];
      const listener = new JarvisVoiceListener({ settleMs: 10, onFinalSpeech: (t) => heard.push(t) });
      listener.start();
      listener.setMuted(false);
      box.rec.onresult(event(['Hey Kevo', true], ['change your voice', false]));
      await wait(1500);
      assert.deepEqual(heard, ['change your voice']);
      listener.stop();
    } finally {
      restore();
    }
  });

  it('the same words said again after Kevo answered are not taken as a late copy', async () => {
    const { box, restore } = fake();
    try {
      const heard: string[] = [];
      const listener = new JarvisVoiceListener({ settleMs: 10, onFinalSpeech: (t) => heard.push(t) });
      listener.start();
      box.rec.onresult(event(['any other voice', false]));
      await wait(1500);
      listener.setMuted(true); // Kevo answers
      listener.setMuted(false);
      listener.keepAwake();
      box.rec.onresult(event(['any other voice', true]));
      await wait(50);
      assert.deepEqual(heard, ['any other voice', 'any other voice']);
      listener.stop();
    } finally {
      restore();
    }
  });
});
