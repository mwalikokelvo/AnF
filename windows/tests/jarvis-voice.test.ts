import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JARVIS_VOICE_PACK, getSelectedVoiceId, setSelectedVoiceId, getSelectedVoiceProfile } from '../src/workspace/jarvis/voice/jarvis-voice-pack';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

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

describe('Kevo approval voice answers (H.4b)', () => {
  it('answers pending approval with yes/approve/sure (true) and cancel/no/deny (false) only while a card is open', async () => {
    let answeredId: number | null = null;
    let answeredApproved: boolean | null = null;

    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      answerApproval: async (id, approved) => {
        answeredId = id;
        answeredApproved = approved;
      },
    });

    // 1. When NO card is open: "yes" and "cancel" do not answer approvals
    const resNoApprovalYes = await agent.processVoiceInput('yes');
    assert.notEqual(resNoApprovalYes.actionName, 'approval_approved');
    assert.equal(answeredId, null);

    const resNoApprovalCancel = await agent.processVoiceInput('cancel');
    assert.notEqual(resNoApprovalCancel.actionName, 'approval_denied');
    assert.equal(answeredId, null);

    // 2. Set an active pending approval: "yes" approves it
    agent.setPendingApproval({
      id: 101,
      action: 'Run script',
      summary: 'Run backup script',
    });

    const resApprove = await agent.processVoiceInput('yes');
    assert.equal(resApprove.handled, true);
    assert.equal(resApprove.actionName, 'approval_approved');
    assert.equal(answeredId, 101);
    assert.equal(answeredApproved, true);
    assert.equal(agent.getPendingApproval(), null, 'pending approval cleared after answering');

    // Subsequent "yes" now has no pending approval
    answeredId = null;
    answeredApproved = null;
    const resAfterClear = await agent.processVoiceInput('yes');
    assert.notEqual(resAfterClear.actionName, 'approval_approved');
    assert.equal(answeredId, null);

    // 3. Set another pending approval: "cancel" denies it
    agent.setPendingApproval({
      id: 102,
      action: 'Delete file',
      summary: 'Delete test.md',
    });

    const resDeny = await agent.processVoiceInput('cancel');
    assert.equal(resDeny.handled, true);
    assert.equal(resDeny.actionName, 'approval_denied');
    assert.equal(answeredId, 102);
    assert.equal(answeredApproved, false);
    assert.equal(agent.getPendingApproval(), null);
  });
});
