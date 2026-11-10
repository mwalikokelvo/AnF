import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JARVIS_VOICE_PACK, getSelectedVoiceId, setSelectedVoiceId, getSelectedVoiceProfile } from '../src/workspace/jarvis/voice/jarvis-voice-pack';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

describe('JARVIS Voice Pack & Profiles', () => {
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
    const res = await agent.processVoiceInput('Jarvis, please pause the music');
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

  it('delegates open questions to AI conversational intelligence', async () => {
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      askAI: async (query) => `Answering: ${query}`,
    });
    const res = await agent.processVoiceInput('What is the theory of general relativity?');
    assert.ok(res.handled);
    assert.strictEqual(res.actionName, 'ai_conversation');
    assert.strictEqual(res.speechReply, 'Answering: What is the theory of general relativity?');
  });
});
