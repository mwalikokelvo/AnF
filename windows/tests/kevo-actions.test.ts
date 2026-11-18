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
});
