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
});
