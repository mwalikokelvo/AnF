/**
 * Kevo Actions Unit Tests (Phase 2 Step 2.1).
 * Verifies single action list definition, OpenAI tool schema generation, and action execution.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEVO_ACTIONS,
  getAllActions,
  getActionByName,
  getOpenAITools,
  getCapabilitySheet,
  getKevoSystemPrompt,
  getCompactKevoSystemPrompt,
  getKevoMemoryPrompt,
  executeKevoAction,
  executeKevoToolCalls,
  parseKevoAskResponse,
  type KevoToolCall,
} from '../src/workspace/jarvis/voice/kevo-actions';
import type { JarvisActionContext } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

function mockContext(overrides?: Partial<JarvisActionContext>): JarvisActionContext {
  return {
    switchView: () => {},
    playMusic: () => {},
    pauseMusic: () => {},
    nextTrack: () => {},
    openApp: async (name) => name,
    openUrl: async () => {},
    searchWeb: async () => {},
    searchMusic: async () => true,
    searchVault: async () => 'Found note',
    saveQuickNote: async () => {},
    changeVoice: (name) => name || 'Kevo',
    voiceNames: () => ['Kevo', 'Nath'],
    announce: () => {},
    getBriefing: async () => 'Briefing text',
    dryRun: true,
    ...overrides,
  };
}

describe('Kevo Actions (Step 2.1: One action list)', () => {
  it('defines all required actions with valid schemas', () => {
    const requiredActions = [
      'open_app',
      'open_site',
      'youtube_search',
      'web_search',
      'music_play',
      'music_pause',
      'next_track',
      'timer_set',
      'timer_cancel',
      'take_note',
      'search_notes',
      'change_voice',
      'list_voices',
      'switch_view',
      'briefing',
      'help',
      'tell_time',
      'tell_date',
      'audius_search',
    ];

    const actions = getAllActions();
    assert.ok(actions.length >= requiredActions.length);

    for (const req of requiredActions) {
      const def = getActionByName(req);
      assert.ok(def, `Action ${req} must be defined`);
      assert.ok(def.description && def.description.length > 5);
      assert.strictEqual(def.parameters.type, 'object');
      assert.strictEqual(typeof def.execute, 'function');
    }
  });

  it('exports valid OpenAI tool schemas for all actions', () => {
    const tools = getOpenAITools();
    assert.strictEqual(tools.length, KEVO_ACTIONS.length);

    for (const t of tools) {
      assert.strictEqual(t.type, 'function');
      assert.ok(t.function.name);
      assert.ok(t.function.description);
      assert.strictEqual(t.function.parameters.type, 'object');
    }
  });

  it('generates a capability sheet mentioning all actions and self-knowledge (Step 2.3)', () => {
    const sheet = getCapabilitySheet();
    assert.ok(sheet.includes('open_app'));
    assert.ok(sheet.includes('tell_time'));
    assert.ok(sheet.includes('next_track'));
    assert.ok(sheet.includes('timer_set'));
    // Step 2.3: what Kevo can and cannot do
    assert.ok(sheet.includes('Capabilities (what Kevo can do)'));
    assert.ok(sheet.includes('Limitations (what Kevo cannot do)'));
    // Step 2.3: wake word and follow-up window
    assert.ok(sheet.includes('Wake word'));
    assert.ok(sheet.includes('Follow-up window'));
    // Step 2.3: how to change voice
    assert.ok(sheet.includes('Changing voice'));
    assert.ok(sheet.includes('/no_think'));
    // getKevoSystemPrompt() returns the prompt
    assert.strictEqual(getKevoSystemPrompt(), sheet);
  });

  it('generates a compact system prompt optimized for prefill latency and KV cache (Step 6.3)', () => {
    const compact = getCompactKevoSystemPrompt();
    assert.ok(compact.includes('/no_think'));
    assert.ok(compact.includes('You are Kevo'));
    // Compact prompt does not repeat all 24 tool definitions
    assert.ok(!compact.includes('Capabilities (what Kevo can do)'));
    assert.ok(compact.length < 300, `compact prompt is ${compact.length} chars, expected < 300`);

    // Facts go in their own message, so the prompt in front of the tool list never changes (prompt cache)
    const facts = [{ id: '1', fact: 'User likes dark mode', category: 'preference', timestamp: 123 }];
    assert.strictEqual(getKevoSystemPrompt(facts, { compact: true }), compact);
    const memory = getKevoMemoryPrompt(facts);
    assert.ok(memory.includes('# Remembered Facts:'));
    assert.ok(memory.includes('[preference] User likes dark mode'));
    assert.strictEqual(getKevoMemoryPrompt([]), '');

    // getKevoSystemPrompt with compact option
    assert.strictEqual(getKevoSystemPrompt(undefined, { compact: true }), compact);
  });

  it('executes app opening and URL actions', async () => {
    let openedApp = '';
    let openedUrl = '';
    const ctx = mockContext({
      dryRun: false,
      openApp: async (name) => {
        openedApp = name;
        return name;
      },
      openUrl: async (url) => {
        openedUrl = url;
      },
    });

    const resApp = await executeKevoAction('open_app', { name: 'Brave' }, ctx);
    assert.strictEqual(resApp.handled, true);
    assert.strictEqual(resApp.actionName, 'open_app');
    assert.strictEqual(openedApp, 'Brave');

    const resSite = await executeKevoAction('open_site', { url: 'github.com' }, ctx);
    assert.strictEqual(resSite.handled, true);
    assert.strictEqual(openedUrl, 'https://github.com'); // url is prepended with https
    assert.match(resSite.speechReply, /github\.com/);
  });

  it('executes next_track and tell_time (#175)', async () => {
    let skipped = false;
    const ctx = mockContext({
      dryRun: false,
      nextTrack: () => {
        skipped = true;
      },
    });

    const resTrack = await executeKevoAction('next_track', {}, ctx);
    assert.strictEqual(resTrack.handled, true);
    assert.strictEqual(resTrack.actionName, 'next_track');
    assert.strictEqual(skipped, true);

    const resTime = await executeKevoAction('tell_time', {}, ctx);
    assert.strictEqual(resTime.handled, true);
    assert.strictEqual(resTime.actionName, 'tell_time');
    assert.match(resTime.speechReply, /It is \d+:\d+/);
  });

  it('executes timer and notes actions', async () => {
    let noteSaved = '';
    const ctx = mockContext({
      dryRun: false,
      saveQuickNote: async (t) => {
        noteSaved = t;
      },
    });

    const resNote = await executeKevoAction('take_note', { text: 'buy groceries' }, ctx);
    assert.strictEqual(resNote.handled, true);
    assert.strictEqual(noteSaved, 'buy groceries');

    const resTimer = await executeKevoAction('timer_set', { seconds: 60 }, ctx);
    assert.strictEqual(resTimer.handled, true);
    assert.strictEqual(resTimer.actionName, 'timer_set');
    assert.match(resTimer.speechReply, /1 minute|60 seconds/);
  });

  it('executes remember_fact action (Step 3.2)', async () => {
    let remembered = '';
    let category = '';
    const ctx = mockContext({
      rememberFact: async (f, c) => {
        remembered = f;
        category = c || '';
      },
    });

    const res = await executeKevoAction('remember_fact', { fact: 'I like jazz', category: 'music' }, ctx);
    assert.strictEqual(res.handled, true);
    assert.strictEqual(res.actionName, 'remember_fact');
    assert.strictEqual(remembered, 'I like jazz');
    assert.strictEqual(category, 'music');
    assert.match(res.speechReply, /I will remember that: I like jazz/);
  });

  it('executes recall_facts action and injects facts into system prompt (Step 3.3)', async () => {
    const mockFacts = [
      { id: 'f1', fact: 'User likes dark chocolate', category: 'diet', created_at: 1, updated_at: 1 },
      { id: 'f2', fact: 'User works in TypeScript', category: 'work', created_at: 2, updated_at: 2 },
    ];
    const ctx = mockContext({
      listFacts: async (q) => {
        if (!q) return mockFacts;
        return mockFacts.filter((f) => f.fact.toLowerCase().includes(q.toLowerCase()));
      },
    });

    const res = await executeKevoAction('recall_facts', {}, ctx);
    assert.strictEqual(res.handled, true);
    assert.strictEqual(res.actionName, 'recall_facts');
    assert.match(res.speechReply, /dark chocolate/);
    assert.match(res.speechReply, /TypeScript/);

    const resQuery = await executeKevoAction('recall_facts', { query: 'chocolate' }, ctx);
    assert.strictEqual(resQuery.handled, true);
    assert.match(resQuery.speechReply, /dark chocolate/);

    const prompt = getKevoSystemPrompt(mockFacts);
    assert.match(prompt, /# Remembered Facts:/);
    assert.match(prompt, /- \[diet\] User likes dark chocolate/);
    assert.match(prompt, /- \[work\] User works in TypeScript/);
  });

  it('executes forget_fact action (Step 3.4)', async () => {
    let deletedId = '';
    const mockFacts = [{ id: 'f1', fact: 'User likes dark chocolate', category: 'diet' }];
    const ctx = mockContext({
      listFacts: async (q) => {
        if (!q) return mockFacts;
        return mockFacts.filter((f) => f.fact.toLowerCase().includes(q.toLowerCase()));
      },
      deleteFact: async (id) => {
        deletedId = id;
        return true;
      },
    });

    const res = await executeKevoAction('forget_fact', { query: 'chocolate' }, ctx);
    assert.strictEqual(res.handled, true);
    assert.strictEqual(res.actionName, 'forget_fact');
    assert.strictEqual(deletedId, 'f1');
    assert.match(res.speechReply, /I have forgotten that: User likes dark chocolate/);

    const resById = await executeKevoAction('forget_fact', { id: 'f1' }, ctx);
    assert.strictEqual(resById.handled, true);
    assert.match(resById.speechReply, /I have forgotten that/);
  });

  it('executes reminder actions (Step 4.2: create_reminder, list_reminders, cancel_reminder)', async () => {
    let createdMsg = '';
    let createdTriggerAt = 0;
    let cancelledId = '';
    const mockReminders = [
      { id: 'rem1', message: 'Take medicine', trigger_at: Date.now() + 60000, created_at: Date.now(), fired: false },
    ];
    const ctx = mockContext({
      createReminder: async (msg, triggerAt) => {
        createdMsg = msg;
        createdTriggerAt = triggerAt;
        return { id: 'rem2', message: msg, trigger_at: triggerAt, created_at: Date.now(), fired: false };
      },
      listReminders: async () => mockReminders,
      cancelReminder: async (target) => {
        cancelledId = target;
        return true;
      },
    });

    const resCreate = await executeKevoAction('create_reminder', { message: 'Feed the cat', delay_seconds: 120 }, ctx);
    assert.strictEqual(resCreate.handled, true);
    assert.strictEqual(resCreate.actionName, 'create_reminder');
    assert.strictEqual(createdMsg, 'Feed the cat');
    assert.ok(createdTriggerAt > Date.now());
    assert.match(resCreate.speechReply, /Reminder set for Feed the cat/);

    const resList = await executeKevoAction('list_reminders', {}, ctx);
    assert.strictEqual(resList.handled, true);
    assert.strictEqual(resList.actionName, 'list_reminders');
    assert.match(resList.speechReply, /Take medicine/);

    const resCancel = await executeKevoAction('cancel_reminder', { query: 'medicine' }, ctx);
    assert.strictEqual(resCancel.handled, true);
    assert.strictEqual(resCancel.actionName, 'cancel_reminder');
    assert.strictEqual(cancelledId, 'medicine');
    assert.match(resCancel.speechReply, /Cancelled reminder for medicine/);
  });

  it('executes schedule_briefing action (Step 4.3)', async () => {
    let scheduledTime = '';
    let cancelled = false;
    const ctx = mockContext({
      scheduleDailyBriefing: async (timeStr) => {
        scheduledTime = timeStr;
        return { id: 'rem_b1', message: `Daily briefing (${timeStr})`, trigger_at: Date.now() + 10000, recurring: 'daily' };
      },
      cancelDailyBriefing: async () => {
        cancelled = true;
        return true;
      },
      getDailyBriefingSchedule: async () => ({
        id: 'rem_b1',
        message: 'Daily briefing (8:00 AM)',
        trigger_at: Date.now() + 10000,
      }),
    });

    const resSchedule = await executeKevoAction('schedule_briefing', { time: '8:00 AM' }, ctx);
    assert.strictEqual(resSchedule.handled, true);
    assert.strictEqual(resSchedule.actionName, 'schedule_briefing');
    assert.strictEqual(scheduledTime, '8:00 AM');
    assert.match(resSchedule.speechReply, /Daily briefing scheduled for 8:00 AM every day/);

    const resStatus = await executeKevoAction('schedule_briefing', {}, ctx);
    assert.strictEqual(resStatus.handled, true);
    assert.match(resStatus.speechReply, /Daily briefing is scheduled for 8:00 AM every day/);

    const resDisable = await executeKevoAction('schedule_briefing', { enabled: false }, ctx);
    assert.strictEqual(resDisable.handled, true);
    assert.strictEqual(cancelled, true);
    assert.match(resDisable.speechReply, /Daily briefing disabled/);
  });

  it('returns graceful unhandled result for unknown action', async () => {
    const ctx = mockContext();
    const res = await executeKevoAction('non_existent_action', {}, ctx);
    assert.strictEqual(res.handled, false);
    assert.match(res.speechReply, /not recognized/);
  });

  it('executes chained tool calls in sequence (Step 2.2: Tool calling)', async () => {
    const executed: string[] = [];
    const parts: string[] = [];
    const ctx = mockContext({
      dryRun: false,
      openApp: async (name) => {
        executed.push(`open:${name}`);
        return name;
      },
      openUrl: async (url) => {
        executed.push(`url:${url}`);
      },
    });

    const calls: KevoToolCall[] = [
      { name: 'open_app', arguments: { name: 'Brave' } },
      { name: 'youtube_search', arguments: { query: 'lofi' } },
    ];

    const res = await executeKevoToolCalls(calls, ctx, (part) => parts.push(part));
    assert.strictEqual(res.handled, true);
    assert.strictEqual(res.actionName, 'open_app+youtube_search');
    assert.deepEqual(executed, ['open:Brave', 'url:https://www.youtube.com/results?search_query=lofi']);
    assert.strictEqual(parts.length, 2);
    assert.match(res.speechReply, /Opening Brave/);
    assert.match(res.speechReply, /Searching YouTube for lofi/);
  });

  it('handles empty tool call array gracefully', async () => {
    const ctx = mockContext();
    const res = await executeKevoToolCalls([], ctx);
    assert.strictEqual(res.handled, false);
    assert.strictEqual(res.actionName, '');
    assert.strictEqual(res.speechReply, '');
  });

  it('parses standard OpenAI tool calls and inline tool call tags', () => {
    // 1. Standard OpenAI tool_calls
    const standardResp = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                function: {
                  name: 'open_app',
                  arguments: JSON.stringify({ name: 'Brave' }),
                },
              },
            ],
          },
        },
      ],
    };
    const parsedStandard = parseKevoAskResponse(standardResp);
    assert.strictEqual(parsedStandard.text, undefined);
    assert.strictEqual(parsedStandard.tool_calls?.length, 1);
    assert.strictEqual(parsedStandard.tool_calls[0].name, 'open_app');
    assert.strictEqual(parsedStandard.tool_calls[0].arguments.name, 'Brave');

    // 2. Inline <tool_call> tags
    const inlineResp = {
      choices: [
        {
          message: {
            content:
              'Opening your app: <tool_call>\n{"name": "open_app", "arguments": {"name": "Spotify"}}\n</tool_call>',
          },
        },
      ],
    };
    const parsedInline = parseKevoAskResponse(inlineResp);
    assert.strictEqual(parsedInline.text, 'Opening your app:');
    assert.strictEqual(parsedInline.tool_calls?.length, 1);
    assert.strictEqual(parsedInline.tool_calls[0].name, 'open_app');
    assert.strictEqual(parsedInline.tool_calls[0].arguments.name, 'Spotify');
    assert.ok(!parsedInline.text.includes('<tool_call>'));

    // 3. Plain conversational text
    const textResp = {
      choices: [
        {
          message: {
            content: 'Hello, I am Kevo.',
          },
        },
      ],
    };
    const parsedText = parseKevoAskResponse(textResp);
    assert.strictEqual(parsedText.text, 'Hello, I am Kevo.');
    assert.strictEqual(parsedText.tool_calls?.length, 0);
  });

  it('enforces verification protocol and execution result schema (Step 5.1)', async () => {
    const ctx = mockContext({
      dryRun: false,
      openApp: async (name) => {
        if (name === 'FailApp') throw new Error('App executable not found');
        return name;
      },
    });

    // Success action has status 'success' and verified true
    const okRes = await executeKevoAction('open_app', { name: 'VS Code' }, ctx);
    assert.strictEqual(okRes.handled, true);
    assert.strictEqual(okRes.status, 'success');
    assert.strictEqual(okRes.verified, true);
    assert.ok(okRes.verificationDetails?.includes('VS Code'));

    // Missing required argument fails pre-execution with INVALID_ARGUMENT
    const missingArgRes = await executeKevoAction('open_app', { name: '' }, ctx);
    assert.strictEqual(missingArgRes.handled, false);
    assert.strictEqual(missingArgRes.status, 'failure');
    assert.strictEqual(missingArgRes.verified, false);
    assert.strictEqual(missingArgRes.reason, 'INVALID_ARGUMENT');

    // Execution throw fails with EXECUTION_FAILED
    const throwRes = await executeKevoAction('open_app', { name: 'FailApp' }, ctx);
    assert.strictEqual(throwRes.handled, false);
    assert.strictEqual(throwRes.status, 'failure');
    assert.strictEqual(throwRes.verified, false);
    assert.strictEqual(throwRes.reason, 'EXECUTION_FAILED');
    assert.ok(throwRes.error?.includes('App executable not found'));

    // Unrecognized action fails with NOT_FOUND
    const unknownRes = await executeKevoAction('non_existent', {}, ctx);
    assert.strictEqual(unknownRes.handled, false);
    assert.strictEqual(unknownRes.status, 'failure');
    assert.strictEqual(unknownRes.verified, false);
    assert.strictEqual(unknownRes.reason, 'NOT_FOUND');

    // Tool calling aggregates verification
    const callsOk = [
      { name: 'tell_time', arguments: {} },
      { name: 'tell_date', arguments: {} },
    ];
    const chainedOk = await executeKevoToolCalls(callsOk, ctx);
    assert.strictEqual(chainedOk.handled, true);
    assert.strictEqual(chainedOk.status, 'success');
    assert.strictEqual(chainedOk.verified, true);

    const callsFail = [
      { name: 'tell_time', arguments: {} },
      { name: 'open_app', arguments: { name: 'FailApp' } },
    ];
    const chainedFail = await executeKevoToolCalls(callsFail, ctx);
    assert.strictEqual(chainedFail.handled, false);
    assert.strictEqual(chainedFail.status, 'failure');
    assert.strictEqual(chainedFail.verified, false);
  });

  it('verifies concrete action outcomes and reports honest failure reasons (Step 5.2)', async () => {
    let noteSaved = '';
    const factsStore: { id: string; fact: string }[] = [];
    const remindersStore: { id: string; message: string; trigger_at: number }[] = [];

    const ctx = mockContext({
      dryRun: false,
      openUrl: async (url) => {
        if (url.includes('invalid-scheme')) throw new Error('Unsupported protocol');
      },
      searchMusic: async (q) => {
        return q.includes('lofi'); // only lofi matches
      },
      saveQuickNote: async (txt) => {
        if (txt.includes('fail')) throw new Error('Disk write failed');
        noteSaved = txt;
      },
      rememberFact: async (f) => {
        factsStore.push({ id: `f_${Date.now()}`, fact: f });
      },
      listFacts: async (q) => {
        if (!q) return factsStore;
        return factsStore.filter((f) => f.fact.includes(q));
      },
      deleteFact: async (id) => {
        const idx = factsStore.findIndex((f) => f.id === id);
        if (idx !== -1) {
          factsStore.splice(idx, 1);
          return true;
        }
        return false;
      },
      createReminder: async (msg, triggerAt) => {
        const rem = { id: `rem_${Date.now()}`, message: msg, trigger_at: triggerAt };
        remindersStore.push(rem);
        return rem;
      },
      cancelReminder: async (target) => {
        const idx = remindersStore.findIndex((r) => r.id === target || r.message.includes(target));
        if (idx !== -1) {
          remindersStore.splice(idx, 1);
          return true;
        }
        return false;
      },
    });

    // 1. open_site URL validation & verification
    const validSite = await executeKevoAction('open_site', { url: 'https://example.com' }, ctx);
    assert.strictEqual(validSite.status, 'success');
    assert.strictEqual(validSite.verified, true);
    assert.ok(validSite.verificationDetails?.includes('https://example.com'));

    // 2. music_play NO_MATCH verification
    const musicFound = await executeKevoAction('music_play', { query: 'lofi beats' }, ctx);
    assert.strictEqual(musicFound.status, 'success');
    assert.strictEqual(musicFound.verified, true);

    const musicMiss = await executeKevoAction('music_play', { query: 'obscure track 12345' }, ctx);
    assert.strictEqual(musicMiss.status, 'failure');
    assert.strictEqual(musicMiss.verified, false);
    assert.strictEqual(musicMiss.reason, 'NO_MATCH');
    assert.match(musicMiss.speechReply, /could not find any music/i);

    // 3. take_note verification
    const noteOk = await executeKevoAction('take_note', { text: 'buy groceries' }, ctx);
    assert.strictEqual(noteOk.status, 'success');
    assert.strictEqual(noteOk.verified, true);
    assert.strictEqual(noteSaved, 'buy groceries');
    assert.ok(noteOk.verificationDetails?.includes('13 chars'));

    const noteFail = await executeKevoAction('take_note', { text: 'fail writing' }, ctx);
    assert.strictEqual(noteFail.status, 'failure');
    assert.strictEqual(noteFail.verified, false);
    assert.strictEqual(noteFail.reason, 'EXECUTION_FAILED');
    assert.match(noteFail.speechReply, /could not save note/i);

    // 4. remember_fact & forget_fact verification
    const remOk = await executeKevoAction('remember_fact', { fact: 'User prefers dark mode' }, ctx);
    assert.strictEqual(remOk.status, 'success');
    assert.strictEqual(remOk.verified, true);
    assert.strictEqual(factsStore.length, 1);

    const forgetOk = await executeKevoAction('forget_fact', { query: 'dark mode' }, ctx);
    assert.strictEqual(forgetOk.status, 'success');
    assert.strictEqual(forgetOk.verified, true);
    assert.strictEqual(factsStore.length, 0);

    const forgetNotFound = await executeKevoAction('forget_fact', { query: 'nonexistent fact' }, ctx);
    assert.strictEqual(forgetNotFound.status, 'failure');
    assert.strictEqual(forgetNotFound.verified, false);
    assert.strictEqual(forgetNotFound.reason, 'NOT_FOUND');
    assert.match(forgetNotFound.speechReply, /couldn't find any remembered facts/i);

    // 5. create_reminder & cancel_reminder verification
    const createRem = await executeKevoAction('create_reminder', { message: 'Feed cat', delay_seconds: 60 }, ctx);
    assert.strictEqual(createRem.status, 'success');
    assert.strictEqual(createRem.verified, true);
    assert.strictEqual(remindersStore.length, 1);

    const cancelRem = await executeKevoAction('cancel_reminder', { query: 'Feed cat' }, ctx);
    assert.strictEqual(cancelRem.status, 'success');
    assert.strictEqual(cancelRem.verified, true);
    assert.strictEqual(remindersStore.length, 0);

    const cancelNotFound = await executeKevoAction('cancel_reminder', { query: 'Nonexistent reminder' }, ctx);
    assert.strictEqual(cancelNotFound.status, 'failure');
    assert.strictEqual(cancelNotFound.verified, false);
    assert.strictEqual(cancelNotFound.reason, 'NOT_FOUND');
    assert.match(cancelNotFound.speechReply, /could not find a reminder/i);
  });
});
