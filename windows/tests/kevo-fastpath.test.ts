/**
 * Kevo Fast Path Unit Tests (Phase 2 Step 2.4: Instant commands stay instant).
 * Verifies that fast-path commands execute immediately with NO model loaded (askAI undefined),
 * and only conversational/general questions route to the model.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import type { JarvisActionContext } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

function createFastPathContext(overrides?: Partial<JarvisActionContext>): JarvisActionContext {
  return {
    switchView: () => {},
    playMusic: () => {},
    pauseMusic: () => {},
    nextTrack: () => {},
    openApp: async (name) => name,
    openUrl: async () => {},
    searchWeb: async () => {},
    searchMusic: async () => true,
    searchVault: async () => 'Found 1 note',
    saveQuickNote: async () => {},
    announce: () => {},
    voiceNames: () => ['Kevo', 'Nath'],
    changeVoice: (n) => n || 'Kevo',
    ...overrides,
  };
}

describe('Kevo Fast Path (Step 2.4: Instant commands stay instant)', () => {
  it('handles stop and repeat with no model loaded', async () => {
    const agent = new JarvisVoiceAgent(createFastPathContext());
    const resStop = await agent.processVoiceInput('stop');
    assert.strictEqual(resStop.handled, true);
    assert.strictEqual(resStop.actionName, 'dismiss');

    const resRepeat = await agent.processVoiceInput('repeat that');
    assert.strictEqual(resRepeat.handled, true);
    assert.strictEqual(resRepeat.actionName, 'repeat');
    agent.dispose();
  });

  it('handles clock and date with no model loaded', async () => {
    const agent = new JarvisVoiceAgent(createFastPathContext());
    const resTime = await agent.processVoiceInput('what time is it?');
    assert.strictEqual(resTime.handled, true);
    assert.strictEqual(resTime.actionName, 'tell_time');
    assert.match(resTime.speechReply, /\b\d{1,2}:\d{2}\b/);

    // A place is answered with that place's time, not the local clock.
    const resTokyo = await agent.processVoiceInput('What time is it in Tokyo?');
    assert.strictEqual(resTokyo.actionName, 'time_in_place');
    assert.match(resTokyo.speechReply, /^It is \d{1,2}:\d{2} in Tokyo\.$/);
    assert.strictEqual((await agent.processVoiceInput("what's the time in new york")).speechReply.endsWith('in New York.'), true);
    // A place Kevo has no zone for is said so, never answered with the time here.
    assert.strictEqual((await agent.processVoiceInput('What time is it in Atlantis now?')).speechReply, 'I do not know the time zone for Atlantis yet.');

    const resDate = await agent.processVoiceInput("what is today's date?");
    assert.strictEqual(resDate.handled, true);
    assert.strictEqual(resDate.actionName, 'tell_date');
    assert.match(resDate.speechReply, /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/);
    agent.dispose();
  });

  it('handles timers and cancellation with no model loaded', async () => {
    let announced = '';
    const agent = new JarvisVoiceAgent(
      createFastPathContext({
        announce: (msg) => {
          announced = msg;
        },
      })
    );

    const resTimer = await agent.processVoiceInput('set a timer for five minutes');
    assert.strictEqual(resTimer.handled, true);
    assert.strictEqual(resTimer.actionName, 'timer_set');
    assert.match(resTimer.speechReply, /5 minutes/);

    const resCancel = await agent.processVoiceInput('cancel timer');
    assert.strictEqual(resCancel.handled, true);
    assert.strictEqual(resCancel.actionName, 'timer_cancel');
    agent.dispose();
  });

  it('handles arithmetic sums with no model loaded', async () => {
    const agent = new JarvisVoiceAgent(createFastPathContext());
    const resSum = await agent.processVoiceInput('what is 24 plus 16');
    assert.strictEqual(resSum.handled, true);
    assert.strictEqual(resSum.actionName, 'arithmetic');
    assert.match(resSum.speechReply, /40/);
    agent.dispose();
  });

  it('handles opening exact installed apps and AnF places with no model loaded', async () => {
    let openedApp = '';
    let switchedView = '';
    const agent = new JarvisVoiceAgent(
      createFastPathContext({
        openApp: async (name) => {
          openedApp = name;
          return name;
        },
        switchView: (view) => {
          switchedView = view;
        },
      })
    );

    const resApp = await agent.processVoiceInput('open Brave');
    assert.strictEqual(resApp.handled, true);
    assert.strictEqual(resApp.actionName, 'open_app');
    assert.strictEqual(openedApp, 'Brave');

    const resPlace = await agent.processVoiceInput('open music');
    assert.strictEqual(resPlace.handled, true);
    assert.strictEqual(resPlace.actionName, 'navigate_music');
    assert.strictEqual(switchedView, 'music');
    agent.dispose();
  });

  it('handles help, name, and microphone queries with no model loaded', async () => {
    const agent = new JarvisVoiceAgent(createFastPathContext());

    const resName = await agent.processVoiceInput('who are you?');
    assert.strictEqual(resName.handled, true);
    assert.strictEqual(resName.actionName, 'name');
    assert.match(resName.speechReply, /Kevo/);

    const resHelp = await agent.processVoiceInput('what can you do?');
    assert.strictEqual(resHelp.handled, true);
    assert.strictEqual(resHelp.actionName, 'help');
    assert.match(resHelp.speechReply, /I can/);

    const resMic = await agent.processVoiceInput('why did you go silent?');
    assert.strictEqual(resMic.handled, true);
    assert.strictEqual(resMic.actionName, 'mic_help');
    assert.match(resMic.speechReply, /microphone/);
    agent.dispose();
  });

  it('routes general questions to model only when asked', async () => {
    // 1. Without askAI loaded
    const agentNoModel = new JarvisVoiceAgent(createFastPathContext());
    const resNoModel = await agentNoModel.processVoiceInput('why is the sky blue?');
    assert.strictEqual(resNoModel.handled, false);
    agentNoModel.dispose();

    // 2. With askAI loaded
    let askedQuery = '';
    const agentWithModel = new JarvisVoiceAgent(
      createFastPathContext({
        askAI: async (query) => {
          askedQuery = query;
          return 'The sky is blue because of Rayleigh scattering.';
        },
      })
    );
    const resWithModel = await agentWithModel.processVoiceInput('why is the sky blue?');
    assert.strictEqual(resWithModel.handled, true);
    assert.strictEqual(resWithModel.actionName, 'ai_conversation');
    assert.strictEqual(askedQuery, 'why is the sky blue?');
    assert.match(resWithModel.speechReply, /Rayleigh/);
    agentWithModel.dispose();
  });

  it('asks the model for words only when a song or clock command is refused (#155)', async () => {
    const seen: Record<string, boolean | undefined> = {};
    const agent = new JarvisVoiceAgent(
      createFastPathContext({
        askAI: async (query, options) => {
          seen[query] = options?.answerOnly;
          return `An answer to: ${query}`;
        },
      })
    );
    for (const said of ['Can you not skip this song?', "Please don't skip that track", "Please don't ever tell me the time"]) {
      assert.strictEqual((await agent.processVoiceInput(said)).actionName, 'ai_conversation');
      assert.strictEqual(seen[said], true, said);
    }
    // Quoted commands (issue-175) and non-request skip questions must also be answered in words only.
    for (const said of [
      'Did you say, skip this song?',
      'Are you asking me to say, skip this song?',
      'Imagine I say, please, skip this song',
      'What happens if I say, tell me the time?',
      'Should I skip this song?',
      'Can I skip this song?',
      'Could I skip this track?',
      'Do I need to skip this song?',
      'Did you skip the song?',
    ]) {
      assert.strictEqual((await agent.processVoiceInput(said)).actionName, 'ai_conversation');
      assert.strictEqual(seen[said], true, said);
    }
    // Not refusals: the model may still act on them.
    for (const said of ['why is the sky blue?', "Why don't you skip this song?", "Don't forget to tell me the time at noon"]) {
      await agent.processVoiceInput(said);
      assert.strictEqual(seen[said], false, said);
    }
    agent.dispose();
  });

  it('handles remember commands instantly on fast path with no model loaded (Step 3.2)', async () => {
    let remembered = '';
    const agent = new JarvisVoiceAgent(
      createFastPathContext({
        rememberFact: async (f) => {
          remembered = f;
        },
      })
    );

    const res = await agent.processVoiceInput('remember that I like dark chocolate');
    assert.strictEqual(res.handled, true);
    assert.strictEqual(res.actionName, 'remember_fact');
    assert.match(res.speechReply, /I will remember that: I like dark chocolate/);
    assert.strictEqual(remembered, 'I like dark chocolate');

    const res2 = await agent.processVoiceInput('Remember: my dog is Milo');
    assert.strictEqual(res2.handled, true);
    assert.strictEqual(res2.actionName, 'remember_fact');
    assert.match(res2.speechReply, /I will remember that: my dog is Milo/);
    assert.strictEqual(remembered, 'my dog is Milo');

    agent.dispose();
  });

  it('handles recall queries instantly on fast path with no model loaded (Step 3.3)', async () => {
    const mockFacts = [
      { id: '1', fact: 'I prefer TypeScript', category: 'code', created_at: 1, updated_at: 1 },
    ];
    const agent = new JarvisVoiceAgent(
      createFastPathContext({
        listFacts: async () => mockFacts,
      })
    );

    const res = await agent.processVoiceInput('what do you remember about me?');
    assert.strictEqual(res.handled, true);
    assert.strictEqual(res.actionName, 'recall_facts');
    assert.match(res.speechReply, /I prefer TypeScript/);

    const res2 = await agent.processVoiceInput('what do you know about me?');
    assert.strictEqual(res2.handled, true);
    assert.strictEqual(res2.actionName, 'recall_facts');
    assert.match(res2.speechReply, /I prefer TypeScript/);

    agent.dispose();
  });

  it('handles forget commands instantly on fast path with no model loaded (Step 3.4)', async () => {
    let deletedId = '';
    let cleared = false;
    const mockFacts = [
      { id: 'f1', fact: 'I like jazz', category: 'music', created_at: 1, updated_at: 1 },
    ];
    const agent = new JarvisVoiceAgent(
      createFastPathContext({
        listFacts: async (q) => (q && q.toLowerCase().includes('jazz') ? mockFacts : []),
        deleteFact: async (id) => {
          deletedId = id;
          return true;
        },
        clearFacts: async () => {
          cleared = true;
          return true;
        },
      })
    );

    const res = await agent.processVoiceInput('forget that I like jazz');
    assert.strictEqual(res.handled, true);
    assert.strictEqual(res.actionName, 'forget_fact');
    assert.match(res.speechReply, /I have forgotten that: I like jazz/);
    assert.strictEqual(deletedId, 'f1');

    const resClear = await agent.processVoiceInput('forget all memories');
    assert.strictEqual(resClear.handled, true);
    assert.strictEqual(resClear.actionName, 'forget_fact');
    assert.match(resClear.speechReply, /forgotten all remembered facts/);
    assert.strictEqual(cleared, true);

    agent.dispose();
  });

  it('handles reminder commands instantly on fast path with no model loaded (Step 4.2)', async () => {
    let createdMsg = '';
    let cancelled = '';
    const mockReminders = [
      { id: 'rem1', message: 'Call Mom', trigger_at: Date.now() + 60000, created_at: Date.now(), fired: false },
    ];
    const agent = new JarvisVoiceAgent(
      createFastPathContext({
        createReminder: async (msg, triggerAt) => {
          createdMsg = msg;
          return { id: 'rem2', message: msg, trigger_at: triggerAt, created_at: Date.now(), fired: false };
        },
        listReminders: async () => mockReminders,
        cancelReminder: async (q) => {
          cancelled = q;
          return true;
        },
      })
    );

    const resSet = await agent.processVoiceInput('set a reminder to call Mom');
    assert.strictEqual(resSet.handled, true);
    assert.strictEqual(resSet.actionName, 'create_reminder');
    assert.strictEqual(createdMsg, 'call Mom');
    assert.match(resSet.speechReply, /Reminder set for call Mom/);

    const resList = await agent.processVoiceInput('what are my reminders?');
    assert.strictEqual(resList.handled, true);
    assert.strictEqual(resList.actionName, 'list_reminders');
    assert.match(resList.speechReply, /Call Mom/);

    const resCancel = await agent.processVoiceInput('cancel reminder for call Mom');
    assert.strictEqual(resCancel.handled, true);
    assert.strictEqual(resCancel.actionName, 'cancel_reminder');
    assert.strictEqual(cancelled, 'call Mom');
    assert.match(resCancel.speechReply, /Cancelled reminder for call Mom/);

    agent.dispose();
  });

  it('handles daily briefing scheduling instantly on fast path with no model loaded (Step 4.3)', async () => {
    let scheduledTime = '';
    let cancelled = false;
    const agent = new JarvisVoiceAgent(
      createFastPathContext({
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
      })
    );

    const resSchedule = await agent.processVoiceInput('schedule daily briefing at 8 AM');
    assert.strictEqual(resSchedule.handled, true);
    assert.strictEqual(resSchedule.actionName, 'schedule_briefing');
    assert.strictEqual(scheduledTime, '8 AM');
    assert.match(resSchedule.speechReply, /Daily briefing scheduled for 8 AM every day/);

    const resStatus = await agent.processVoiceInput('when is my daily briefing?');
    assert.strictEqual(resStatus.handled, true);
    assert.strictEqual(resStatus.actionName, 'schedule_briefing');
    assert.match(resStatus.speechReply, /Daily briefing is scheduled for 8:00 AM every day/);

    const resDisable = await agent.processVoiceInput('turn off daily briefing');
    assert.strictEqual(resDisable.handled, true);
    assert.strictEqual(resDisable.actionName, 'schedule_briefing');
    assert.strictEqual(cancelled, true);
    assert.match(resDisable.speechReply, /Daily briefing disabled/);

    agent.dispose();
  });

  it('delivers honest spoken feedback and failure diagnosis on fast path (Step 5.3)', async () => {
    const agent = new JarvisVoiceAgent(
      createFastPathContext({
        openApp: async (name) => {
          if (name.includes('Nonexistent')) throw new Error(`I could not find an app called ${name} in the Start Menu.`);
          return name;
        },
        openUrl: async (url) => {
          if (url.includes('youtube')) throw new Error('Network error: host unreachable');
        },
        cancelReminder: async (_target) => false, // not found
      })
    );

    // App not found reports failure honestly with NOT_FOUND reason
    const resAppFail = await agent.processVoiceInput('open NonexistentApp');
    assert.strictEqual(resAppFail.handled, true);
    assert.strictEqual(resAppFail.actionName, 'open_app_failed');
    assert.strictEqual(resAppFail.status, 'failure');
    assert.strictEqual(resAppFail.verified, false);
    assert.strictEqual(resAppFail.reason, 'NOT_FOUND');
    assert.match(resAppFail.speechReply, /could not find an app/i);

    // Browser failure reports honest diagnosis
    const resUrlFail = await agent.processVoiceInput('search YouTube for jazz');
    assert.strictEqual(resUrlFail.handled, true);
    assert.strictEqual(resUrlFail.actionName, 'open_site_failed');
    assert.strictEqual(resUrlFail.status, 'failure');
    assert.strictEqual(resUrlFail.verified, false);
    assert.strictEqual(resUrlFail.reason, 'EXECUTION_FAILED');
    assert.match(resUrlFail.speechReply, /could not open the browser/i);

    // Reminder not found returns failure with NOT_FOUND
    const resCancelFail = await agent.processVoiceInput('cancel reminder for gym');
    assert.strictEqual(resCancelFail.handled, true);
    assert.strictEqual(resCancelFail.actionName, 'cancel_reminder');
    assert.strictEqual(resCancelFail.status, 'failure');
    assert.strictEqual(resCancelFail.verified, false);
    assert.strictEqual(resCancelFail.reason, 'NOT_FOUND');
    assert.match(resCancelFail.speechReply, /could not find a reminder/i);

    agent.dispose();
  });
});
