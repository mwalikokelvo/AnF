import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JARVIS_VOICE_PACK, getSelectedVoiceId, setSelectedVoiceId, getSelectedVoiceProfile } from '../src/workspace/jarvis/voice/jarvis-voice-pack';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { JarvisVoiceListener } from '../src/workspace/jarvis/voice/jarvis-voice-listener';

describe('Kevo Voice Pack & Profiles', () => {
  it('loads voice pack items including all user provided voices', () => {
    assert.ok(JARVIS_VOICE_PACK.length >= 12, 'contains all voice files');
    const ids = JARVIS_VOICE_PACK.map(v => v.id);
    assert.ok(ids.includes('nath-british-calm'));
    assert.ok(ids.includes('kelvin-mwamburi'));
    assert.ok(ids.includes('burt-deep-smooth'));
    assert.ok(ids.includes('dav-movie-trailer'));
  });

  it('selects and retrieves active voice profile', () => {
    setSelectedVoiceId('burt-deep-smooth');
    const selected = getSelectedVoiceProfile();
    assert.strictEqual(selected.id, 'burt-deep-smooth');
    assert.ok(selected.filename.includes('Burt'));
    // reset to default
    setSelectedVoiceId('nath-british-calm');
  });
});

describe('JarvisVoiceAgent Intent & Action Processing', () => {
  it('handles media pause command', async () => {
    let paused = false;
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      pauseMusic: () => { paused = true; },
    });
    const res = await agent.processVoiceInput('Kevo, please pause the music');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'pause_music');
    assert.strictEqual(paused, true);
  });

  it('handles navigation command', async () => {
    let targetView = '';
    const agent = new JarvisVoiceAgent({
      switchView: (v) => { targetView = v; },
    });
    const res = await agent.processVoiceInput('Open music hub');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'navigate_music');
    assert.strictEqual(targetView, 'music');
  });

  it('handles note-taking command', async () => {
    let capturedNote = '';
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      saveQuickNote: async (text) => { capturedNote = text; },
    });
    const res = await agent.processVoiceInput('Take a note: Buy new microphone tomorrow');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'take_note');
    assert.strictEqual(capturedNote, 'Buy new microphone tomorrow');
  });

  it('handles voice music search and play command', async () => {
    let queriedSong = '';
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      searchMusic: async (q) => {
        queriedSong = q;
        return true;
      },
    });
    const res = await agent.processVoiceInput('play Wimbo wangu');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'search_play_music');
    assert.strictEqual(queriedSong, 'Wimbo wangu');
    assert.ok(res.speechReply.includes('Wimbo wangu'));
  });

  it('handles explicit search song command', async () => {
    let queriedSong = '';
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      searchMusic: async (q) => {
        queriedSong = q;
        return false;
      },
    });
    const res = await agent.processVoiceInput('search song Wimbo wangu');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'search_music');
    assert.strictEqual(queriedSong, 'Wimbo wangu');
  });

  it('handles vault note search command', async () => {
    let vaultQuery = '';
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      searchVault: async (q) => {
        vaultQuery = q;
        return `Found 1 note: DSP Notes.`;
      },
    });
    const res = await agent.processVoiceInput('search notes for audio equalizer');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'search_vault');
    assert.strictEqual(vaultQuery, 'audio equalizer');
    assert.match(res.speechReply, /DSP Notes/);
  });

  it('delegates open questions to AI conversational intelligence', async () => {
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      askAI: async (query) => `Answering: ${query}`,
    });
    const res = await agent.processVoiceInput('What is the theory of general relativity?');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'ai_conversation');
    assert.match(res.speechReply, /Answering:/);
  });

  it('answers time and date without calling the model', async () => {
    const agent = new JarvisVoiceAgent({ switchView: () => {} });
    const time = await agent.processVoiceInput('What time is it?');
    assert.equal(time.actionName, 'tell_time');
    assert.match(time.speechReply, /It is /);

    const date = await agent.processVoiceInput("Tell me today's date");
    assert.equal(date.actionName, 'tell_date');
    assert.match(date.speechReply, /Today is /);
  });

  it('opens notes via quick capture navigation', async () => {
    let opened = false;
    let view = '';
    const agent = new JarvisVoiceAgent({
      switchView: (v) => { view = v; },
      openQuickCapture: () => { opened = true; },
    });
    const res = await agent.processVoiceInput('Open my notes');
    assert.equal(res.actionName, 'navigate_notes');
    assert.equal(view, 'home');
    assert.equal(opened, true);
  });
});

describe('Kevo 0.2 fix 4: follow-up questions expire (#160)', () => {
  it('expires follow-up state (timer prompt) past the limit so "five minutes" goes to the AI, but sets timer inside limit', async () => {
    let fakeNow = 1_000_000;
    let aiCalled = false;

    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      now: () => fakeNow,
      announce: () => {},
      askAI: async (q) => {
        aiCalled = true;
        return `AI answered: ${q}`;
      },
    });

    try {
      // 1. "set a timer" prompts "For how long?" (timer_unclear)
      const prompt1 = await agent.processVoiceInput('set a timer');
      assert.equal(prompt1.actionName, 'timer_unclear');
      assert.match(prompt1.speechReply, /For how long/);

      // 2. Inside the limit (15 s elapsed <= 30 s default limit): "five minutes" sets the timer
      fakeNow += 15_000;
      const answerInside = await agent.processVoiceInput('five minutes');
      assert.equal(answerInside.actionName, 'timer_set');
      assert.match(answerInside.speechReply, /5 minutes/);
      assert.equal(aiCalled, false);

      // 3. Ask "set a timer" again
      const prompt2 = await agent.processVoiceInput('set a timer');
      assert.equal(prompt2.actionName, 'timer_unclear');

      // 4. Past the limit (35 s elapsed > 30 s limit): "five minutes" must go to the AI
      fakeNow += 35_000;
      const answerOutside = await agent.processVoiceInput('five minutes');
      assert.equal(answerOutside.actionName, 'ai_conversation');
      assert.equal(aiCalled, true);
    } finally {
      agent.dispose();
    }
  });

  it('expires lastSubject past the limit so "open it" fails with open_unclear', async () => {
    let fakeNow = 2_000_000;
    const opened: string[] = [];

    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      now: () => fakeNow,
      openApp: async (name) => {
        opened.push(name);
        return name;
      },
    });

    try {
      // Talk about an app name
      await agent.processVoiceInput('Brave browser.');

      // Inside limit (10 s elapsed): "open it" opens Brave browser
      fakeNow += 10_000;
      const resInside = await agent.processVoiceInput('open it');
      assert.equal(resInside.actionName, 'open_app');
      assert.deepEqual(opened, ['Brave browser']);

      // Talk about another subject
      await agent.processVoiceInput('Spotify.');

      // Past limit (31 s elapsed): "open it" fails with open_unclear
      fakeNow += 31_000;
      const resOutside = await agent.processVoiceInput('open it');
      assert.equal(resOutside.actionName, 'open_unclear');
      assert.match(resOutside.speechReply, /Open what/);
    } finally {
      agent.dispose();
    }
  });
});

describe('Kevo 0.2 fix 2: Calvo and Kalvo wake words in listener (#158)', () => {
  function fakeRecogniser() {
    const g = globalThis as any;
    const prev = g.window;
    const box: { rec: any } = { rec: null };
    g.window = {
      SpeechRecognition: class {
        start() { this.onstart?.(); }
        stop() { this.onend?.(); }
        abort() {}
        onstart: any;
        onend: any;
        constructor() { box.rec = this; }
      },
    };
    return { box, restore: () => { g.window = prev; } };
  }

  const final = (text: string) => ({
    resultIndex: 0,
    results: [Object.assign([{ transcript: text }], { isFinal: true })],
  });

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('drives listener with "Calvo, what is 12 times 8?" while not awake and checks request comes through', async () => {
    const { box, restore } = fakeRecogniser();
    try {
      const heard: string[] = [];
      const wakeWordsDetected: string[] = [];

      // followUpMs: 20 so awake window from start tap expires quickly
      const listener = new JarvisVoiceListener({
        settleMs: 0,
        followUpMs: 20,
        requireWakeWord: true,
        onFinalSpeech: (text) => heard.push(text),
        onWakeWord: (w) => wakeWordsDetected.push(w),
      });

      listener.start();
      // Wait for initial start tap awake window to expire
      await wait(30);
      assert.equal(listener.isAwake(), false, 'listener must not be awake before wake word is spoken');

      // 1. Unrecognized name while not awake must be dropped
      box.rec.onresult(final('Dave, what is 12 times 8?'));
      assert.deepEqual(heard, [], 'unrecognized name while not awake must be dropped');

      // 2. "Calvo, what is 12 times 8?" while not awake wakes listener and passes command through
      box.rec.onresult(final('Calvo, what is 12 times 8?'));
      assert.deepEqual(heard, ['what is 12 times 8?']);
      assert.ok(wakeWordsDetected.includes('calvo'));

      // Wait again for awake window to expire
      heard.length = 0;
      await wait(30);
      assert.equal(listener.isAwake(), false);

      // 3. "Kalvo, what is 12 times 8?" also wakes listener and passes command through
      box.rec.onresult(final('Kalvo, what is 12 times 8?'));
      assert.deepEqual(heard, ['what is 12 times 8?']);
      assert.ok(wakeWordsDetected.includes('kalvo'));

      listener.stop();
    } finally {
      restore();
    }
  });
});
