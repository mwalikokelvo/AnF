/**
 * Kevo Verification Test Suite (Phase 5 Step 5.5).
 * Comprehensive end-to-end tests for action verification, status reporting,
 * error taxonomy, honest spoken feedback, and failure handling across all core actions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeKevoAction,
  executeKevoToolCalls,
  type KevoToolCall,
} from '../src/workspace/jarvis/voice/kevo-actions';
import { JarvisVoiceAgent, type JarvisActionContext } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

function createMockContext(overrides?: Partial<JarvisActionContext>): JarvisActionContext {
  const facts: { id: string; fact: string }[] = [];
  const reminders: { id: string; message: string; trigger_at: number }[] = [];
  let currentVolume = 50;

  return {
    switchView: () => {},
    playMusic: () => {},
    pauseMusic: () => {},
    nextTrack: () => {},
    setMusicVolume: (v) => { currentVolume = v; },
    openApp: async (name) => {
      if (name.toLowerCase().includes('missing')) return null;
      if (name.toLowerCase().includes('crash')) throw new Error('Process launch error');
      return name;
    },
    openUrl: async (url) => {
      if (url.includes('bad-protocol')) throw new Error('Unsupported protocol');
    },
    searchWeb: async () => {},
    searchMusic: async (q) => {
      return !q.toLowerCase().includes('nonexistent');
    },
    searchVault: async (q) => {
      if (q.toLowerCase().includes('empty')) return 'No matching notes found.';
      return `Found note matching "${q}"`;
    },
    saveQuickNote: async (txt) => {
      if (txt.includes('disk_error')) throw new Error('Disk full');
    },
    changeVoice: (name) => name || 'Kevo',
    voiceNames: () => ['Kevo', 'Nath'],
    announce: () => {},
    getBriefing: async () => 'Executive briefing for today.',
    rememberFact: async (f) => {
      facts.push({ id: `f_${Date.now()}_${facts.length}`, fact: f });
    },
    listFacts: async (q) => {
      if (!q) return facts;
      return facts.filter((f) => f.fact.toLowerCase().includes(q.toLowerCase()));
    },
    deleteFact: async (id) => {
      const idx = facts.findIndex((f) => f.id === id);
      if (idx !== -1) {
        facts.splice(idx, 1);
        return true;
      }
      return false;
    },
    createReminder: async (msg, triggerAt) => {
      const rem = { id: `rem_${Date.now()}_${reminders.length}`, message: msg, trigger_at: triggerAt };
      reminders.push(rem);
      return rem;
    },
    listReminders: async () => reminders,
    cancelReminder: async (target) => {
      const idx = reminders.findIndex((r) => r.id === target || r.message.toLowerCase().includes(target.toLowerCase()));
      if (idx !== -1) {
        reminders.splice(idx, 1);
        return true;
      }
      return false;
    },
    dryRun: false,
    ...overrides,
  };
}

describe('Kevo Action Verification Suite (Phase 5 Step 5.5)', () => {
  describe('Application and Navigation Actions', () => {
    it('open_app: succeeds and verifies when app is found', async () => {
      const ctx = createMockContext();
      const res = await executeKevoAction('open_app', { name: 'Spotify' }, ctx);
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.verified, true);
      assert.match(res.speechReply, /Opening Spotify, sir\./i);
      assert.ok(res.verificationDetails?.includes('Spotify'));
    });

    it('open_app: fails honestly with NOT_FOUND when app is not installed', async () => {
      const ctx = createMockContext();
      const res = await executeKevoAction('open_app', { name: 'MissingApp' }, ctx);
      assert.strictEqual(res.status, 'failure');
      assert.strictEqual(res.verified, false);
      assert.strictEqual(res.reason, 'NOT_FOUND');
      assert.match(res.speechReply, /could not find or launch MissingApp/i);
    });

    it('open_app: fails with EXECUTION_FAILED when launch throws exception', async () => {
      const ctx = createMockContext();
      const res = await executeKevoAction('open_app', { name: 'CrashApp' }, ctx);
      assert.strictEqual(res.status, 'failure');
      assert.strictEqual(res.verified, false);
      assert.strictEqual(res.reason, 'EXECUTION_FAILED');
      assert.match(res.speechReply, /could not open CrashApp/i);
    });

    it('open_app: fails with INVALID_ARGUMENT when app name is blank', async () => {
      const ctx = createMockContext();
      const res = await executeKevoAction('open_app', { name: '   ' }, ctx);
      assert.strictEqual(res.status, 'failure');
      assert.strictEqual(res.verified, false);
      assert.strictEqual(res.reason, 'INVALID_ARGUMENT');
    });

    it('open_site: succeeds and verifies valid URL', async () => {
      const ctx = createMockContext();
      const res = await executeKevoAction('open_site', { url: 'https://github.com' }, ctx);
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.verified, true);
      assert.match(res.speechReply, /Opening https:\/\/github\.com/i);
      assert.ok(res.verificationDetails?.includes('https://github.com'));
    });

    it('open_site: automatically prefixes scheme and succeeds', async () => {
      const ctx = createMockContext();
      const res = await executeKevoAction('open_site', { url: 'news.ycombinator.com' }, ctx);
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.verified, true);
      assert.ok(res.verificationDetails?.includes('https://news.ycombinator.com'));
    });

    it('open_site: fails with EXECUTION_FAILED on invalid URL or launch error', async () => {
      const ctx = createMockContext();
      const res = await executeKevoAction('open_site', { url: 'bad-protocol://xyz' }, ctx);
      assert.strictEqual(res.status, 'failure');
      assert.strictEqual(res.verified, false);
      assert.strictEqual(res.reason, 'EXECUTION_FAILED');
    });
  });

  describe('Search and Media Actions', () => {
    it('youtube_search & web_search: verify successful execution and parameter validation', async () => {
      const ctx = createMockContext();
      const yt = await executeKevoAction('youtube_search', { query: 'jazz piano' }, ctx);
      assert.strictEqual(yt.status, 'success');
      assert.strictEqual(yt.verified, true);
      assert.match(yt.speechReply, /Searching YouTube for jazz piano/i);

      const web = await executeKevoAction('web_search', { query: 'weather today' }, ctx);
      assert.strictEqual(web.status, 'success');
      assert.strictEqual(web.verified, true);
      assert.match(web.speechReply, /Searching the web for weather today/i);

      const invalid = await executeKevoAction('web_search', { query: '' }, ctx);
      assert.strictEqual(invalid.status, 'failure');
      assert.strictEqual(invalid.reason, 'INVALID_ARGUMENT');
    });

    it('music_play: verifies playback on found query and reports NO_MATCH on missing', async () => {
      const ctx = createMockContext();
      const hit = await executeKevoAction('music_play', { query: 'lofi hip hop' }, ctx);
      assert.strictEqual(hit.status, 'success');
      assert.strictEqual(hit.verified, true);
      assert.match(hit.speechReply, /Playing lofi hip hop/i);

      const miss = await executeKevoAction('music_play', { query: 'nonexistent song 9999' }, ctx);
      assert.strictEqual(miss.status, 'failure');
      assert.strictEqual(miss.verified, false);
      assert.strictEqual(miss.reason, 'NO_MATCH');
      assert.match(miss.speechReply, /could not find any music matching/i);
    });

    it('music_pause & next_track: verify playback control state', async () => {
      let paused = false;
      let nextCalled = false;
      const ctx = createMockContext({
        pauseMusic: () => { paused = true; },
        nextTrack: () => { nextCalled = true; },
      });

      const pauseRes = await executeKevoAction('music_pause', {}, ctx);
      assert.strictEqual(pauseRes.status, 'success');
      assert.strictEqual(pauseRes.verified, true);
      assert.strictEqual(paused, true);

      const nextRes = await executeKevoAction('next_track', {}, ctx);
      assert.strictEqual(nextRes.status, 'success');
      assert.strictEqual(nextRes.verified, true);
      assert.strictEqual(nextCalled, true);
    });
  });

  describe('Notes and Vault Verification', () => {
    it('take_note: verifies non-empty note write to vault', async () => {
      let savedContent = '';
      const ctx = createMockContext({
        saveQuickNote: async (t) => { savedContent = t; },
      });

      const res = await executeKevoAction('take_note', { text: 'Remember to submit expense report' }, ctx);
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.verified, true);
      assert.strictEqual(savedContent, 'Remember to submit expense report');
      assert.match(res.speechReply, /Note saved to your vault, sir\./i);
      assert.ok(res.verificationDetails?.includes('chars'));
    });

    it('take_note: fails honestly when vault write fails', async () => {
      const ctx = createMockContext();
      const res = await executeKevoAction('take_note', { text: 'disk_error note' }, ctx);
      assert.strictEqual(res.status, 'failure');
      assert.strictEqual(res.verified, false);
      assert.strictEqual(res.reason, 'EXECUTION_FAILED');
      assert.match(res.speechReply, /could not save note/i);
    });

    it('search_notes: verifies search query execution', async () => {
      const ctx = createMockContext();
      const res = await executeKevoAction('search_notes', { query: 'project roadmap' }, ctx);
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.verified, true);
      assert.match(res.speechReply, /project roadmap/i);
    });
  });

  describe('Memory and Schedule Verification', () => {
    it('remember_fact & forget_fact: verify write and delete verification cycles', async () => {
      const ctx = createMockContext();

      // Remember
      const rem = await executeKevoAction('remember_fact', { fact: 'Prefers tea over coffee' }, ctx);
      assert.strictEqual(rem.status, 'success');
      assert.strictEqual(rem.verified, true);
      assert.match(rem.speechReply, /I will remember that: Prefers tea over coffee/i);

      // Forget success
      const del = await executeKevoAction('forget_fact', { query: 'tea' }, ctx);
      assert.strictEqual(del.status, 'success');
      assert.strictEqual(del.verified, true);
      assert.match(del.speechReply, /I have forgotten that: Prefers tea over coffee/i);

      // Forget not found
      const delNotFound = await executeKevoAction('forget_fact', { query: 'nonexistent preference' }, ctx);
      assert.strictEqual(delNotFound.status, 'failure');
      assert.strictEqual(delNotFound.verified, false);
      assert.strictEqual(delNotFound.reason, 'NOT_FOUND');
      assert.match(delNotFound.speechReply, /couldn't find any remembered facts/i);
    });

    it('create_reminder & cancel_reminder: verify schedule verification cycle', async () => {
      const ctx = createMockContext();

      // Create
      const add = await executeKevoAction('create_reminder', { message: 'Drink water', delay_seconds: 120 }, ctx);
      assert.strictEqual(add.status, 'success');
      assert.strictEqual(add.verified, true);
      assert.match(add.speechReply, /Reminder set for/i);

      // Cancel success
      const cancel = await executeKevoAction('cancel_reminder', { query: 'Drink water' }, ctx);
      assert.strictEqual(cancel.status, 'success');
      assert.strictEqual(cancel.verified, true);
      assert.match(cancel.speechReply, /Cancelled reminder/i);

      // Cancel not found
      const cancelNotFound = await executeKevoAction('cancel_reminder', { query: 'Walk dog' }, ctx);
      assert.strictEqual(cancelNotFound.status, 'failure');
      assert.strictEqual(cancelNotFound.verified, false);
      assert.strictEqual(cancelNotFound.reason, 'NOT_FOUND');
      assert.match(cancelNotFound.speechReply, /could not find a reminder matching/i);
    });

    it('timer_set & timer_cancel: verify timer validation', async () => {
      let announced = '';
      const ctx = createMockContext({
        announce: (msg) => { announced = msg; },
      });

      const setRes = await executeKevoAction('timer_set', { seconds: 300 }, ctx);
      assert.strictEqual(setRes.status, 'success');
      assert.strictEqual(setRes.verified, true);
      assert.match(setRes.speechReply, /Timer set for 5 minutes/i);

      const cancelRes = await executeKevoAction('timer_cancel', {}, ctx);
      assert.strictEqual(cancelRes.status, 'success');
      assert.strictEqual(cancelRes.verified, true);
      assert.match(cancelRes.speechReply, /Timer cancelled/i);

      // Invalid seconds parameter
      const badRes = await executeKevoAction('timer_set', { seconds: -10 }, ctx);
      assert.strictEqual(badRes.status, 'failure');
      assert.strictEqual(badRes.reason, 'INVALID_ARGUMENT');
    });
  });

  describe('Chained Tool Calls & Voice Agent End-to-End Verification', () => {
    it('executeKevoToolCalls: aggregate verification succeeds when all pass', async () => {
      const ctx = createMockContext();
      const calls: KevoToolCall[] = [
        { name: 'tell_time', arguments: {} },
        { name: 'tell_date', arguments: {} },
      ];

      const res = await executeKevoToolCalls(calls, ctx);
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.verified, true);
      assert.strictEqual(res.handled, true);
    });

    it('executeKevoToolCalls: aggregate verification fails when any action fails', async () => {
      const ctx = createMockContext();
      const calls: KevoToolCall[] = [
        { name: 'tell_time', arguments: {} },
        { name: 'open_app', arguments: { name: 'MissingApp' } },
      ];

      const res = await executeKevoToolCalls(calls, ctx);
      assert.strictEqual(res.status, 'failure');
      assert.strictEqual(res.verified, false);
      assert.strictEqual(res.reason, 'NOT_FOUND');
    });

    it('JarvisVoiceAgent: processVoiceInput propagates verification status on fast paths', async () => {
      const ctx = createMockContext();
      const agent = new JarvisVoiceAgent(ctx);

      // Successful fast path
      const successRes = await agent.processVoiceInput('open Spotify');
      assert.strictEqual(successRes.status, 'success');
      assert.strictEqual(successRes.verified, true);
      assert.strictEqual(successRes.handled, true);
      assert.match(successRes.speechReply, /Opening Spotify\./i);

      // Failed fast path
      const failRes = await agent.processVoiceInput('open MissingApp');
      assert.strictEqual(failRes.status, 'failure');
      assert.strictEqual(failRes.verified, false);
      assert.strictEqual(failRes.reason, 'NOT_FOUND');
      assert.match(failRes.speechReply, /could not find or launch MissingApp/i);
    });
  });
});
