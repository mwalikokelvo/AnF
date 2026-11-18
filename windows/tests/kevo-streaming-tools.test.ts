/**
 * Kevo Streaming Tool Calling & Low-Latency Sentence Chunking Test Suite (Phase 6 Step 6.2).
 * Verifies that local AI inference supports streaming chunks concurrently with tool execution,
 * withholds inline <tool_call> tags from voice synthesis, emits conversational text with zero delay,
 * and seamlessly propagates verification telemetry.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  JarvisVoiceAgent,
  unspokenRest,
  type JarvisActionContext,
} from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import {
  executeKevoToolCalls,
  type KevoToolCall,
} from '../src/workspace/jarvis/voice/kevo-actions';

function createMockContext(overrides?: Partial<JarvisActionContext>): JarvisActionContext {
  const reminders: { id: string; message: string; trigger_at: number }[] = [];
  return {
    switchView: () => {},
    playMusic: () => {},
    pauseMusic: () => {},
    nextTrack: () => {},
    announce: () => {},
    openApp: async (name) => {
      if (name.toLowerCase().includes('nonexistent')) return '';
      return name;
    },
    createReminder: async (msg, triggerAt) => {
      const rem = { id: `rem_${Date.now()}`, message: msg, trigger_at: triggerAt };
      reminders.push(rem);
      return rem;
    },
    listReminders: async () => reminders,
    cancelReminder: async () => true,
    dryRun: false,
    ...overrides,
  };
}

describe('Kevo Streaming Tool Calling & Low-Latency Chunking (Phase 6 Step 6.2)', () => {
  describe('executeKevoToolCalls: streaming onPart callbacks', () => {
    it('streams action speechReply to onPart callback immediately upon execution', async () => {
      const parts: string[] = [];
      const toolCalls: KevoToolCall[] = [
        {
          name: 'timer_set',
          arguments: { seconds: 120, label: 'pasta' },
        },
      ];

      const context = createMockContext();
      const result = await executeKevoToolCalls(toolCalls, context, (part) => {
        parts.push(part);
      });

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.actionName, 'timer_set');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.verified, true);
      assert.strictEqual(parts.length, 1);
      assert.match(parts[0], /timer set for 2 minutes, sir\./i);
    });

    it('streams multiple chained tool actions sequentially to onPart', async () => {
      const parts: string[] = [];
      const toolCalls: KevoToolCall[] = [
        {
          name: 'switch_view',
          arguments: { view: 'music' },
        },
        {
          name: 'music_pause',
          arguments: {},
        },
      ];

      const context = createMockContext();
      const result = await executeKevoToolCalls(toolCalls, context, (part) => {
        parts.push(part);
      });

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.verified, true);
      assert.strictEqual(parts.length, 2);
      assert.strictEqual(parts[0], 'Switched view to music, sir.');
      assert.strictEqual(parts[1], 'Playback paused, sir.');
    });
  });

  describe('JarvisVoiceAgent: streaming askAI integration with tools', () => {
    it('streams conversational prefix sentence before executing tool call', async () => {
      const parts: string[] = [];
      const mockContext = createMockContext();
      const agent = new JarvisVoiceAgent({
        ...mockContext,
        askAI: async (query, options) => {
          // Simulate streaming: model emits conversational prefix to onPart
          options?.onPart?.('Checking the timer for you right away.');
          // Then executes tool call with onPart
          const toolCalls: KevoToolCall[] = [
            { name: 'timer_set', arguments: { seconds: 60 } },
          ];
          const executed = await executeKevoToolCalls(
            toolCalls,
            mockContext,
            options?.onPart
          );
          const fullText = ['Checking the timer for you right away.', executed.speechReply].join(' ');
          return {
            text: fullText,
            actionName: executed.actionName,
            status: executed.status,
            verified: executed.verified,
          };
        },
      });

      // Conversational prompt routed to askAI
      const res = await agent.processVoiceInput('Help me manage my study session today', (part) => {
        parts.push(part);
      });

      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.actionName, 'timer_set');
      assert.strictEqual(res.status, 'success');
      assert.strictEqual(res.verified, true);
      assert.strictEqual(parts.length, 2);
      assert.strictEqual(parts[0], 'Checking the timer for you right away.');
      assert.match(parts[1], /timer set for 1 minute, sir\./i);
    });

    it('propagates failure telemetry when tool execution fails in streamed response', async () => {
      const parts: string[] = [];
      const mockContext = createMockContext();
      const agent = new JarvisVoiceAgent({
        ...mockContext,
        askAI: async (query, options) => {
          options?.onPart?.('Attempting to open the application.');
          const toolCalls: KevoToolCall[] = [
            { name: 'open_app', arguments: { name: 'NonexistentAppXYZ' } },
          ];
          const executed = await executeKevoToolCalls(
            toolCalls,
            mockContext,
            options?.onPart
          );
          return {
            text: executed.speechReply,
            actionName: executed.actionName,
            status: executed.status,
            verified: executed.verified,
            reason: executed.reason,
          };
        },
      });

      // Complex request routed to askAI
      const res = await agent.processVoiceInput('Please check if we can run NonexistentAppXYZ today', (part) => {
        parts.push(part);
      });

      assert.strictEqual(res.handled, false);
      assert.strictEqual(res.status, 'failure');
      assert.strictEqual(res.verified, false);
      assert.strictEqual(res.reason, 'NOT_FOUND');
      assert.match(res.speechReply, /could not find or launch NonexistentAppXYZ/i);
    });
  });

  describe('unspokenRest: seamless chunk-to-whole delivery without stutter', () => {
    it('returns empty string when all parts have already been spoken', () => {
      const spoken = 'Here is the weather. It is sunny today.';
      const whole = 'Here is the weather. It is sunny today.';
      assert.strictEqual(unspokenRest(spoken, whole), '');
    });

    it('returns the trailing unspoken sentence when only the prefix was streamed', () => {
      const spoken = 'Setting a timer for you.';
      const whole = 'Setting a timer for you. Timer set for five minutes.';
      assert.strictEqual(unspokenRest(spoken, whole), 'Timer set for five minutes.');
    });

    it('returns empty string if nothing was spoken yet', () => {
      const spoken = '';
      const whole = 'Timer set for five minutes.';
      assert.strictEqual(unspokenRest(spoken, whole), '');
    });
  });
});
