import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdviceRequest,
  randomAdvice,
  LOCAL_ADVICE,
} from '../src/workspace/jarvis/voice/kevo-advice';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { executeKevoAction } from '../src/workspace/jarvis/voice/kevo-actions';
import type { LookupFetch } from '../src/workspace/jarvis/voice/kevo-online';

function mockAdviceFetch(advice: string, ok = true): LookupFetch {
  return async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ slip: { id: 1, advice } }),
  });
}

describe('Kevo: Random Advice', () => {
  it('recognizes advice requests', () => {
    assert.equal(isAdviceRequest('give me advice'), true);
    assert.equal(isAdviceRequest('give me some advice'), true);
    assert.equal(isAdviceRequest('give me a piece of advice'), true);
    assert.equal(isAdviceRequest('tell me some advice'), true);
    assert.equal(isAdviceRequest('random advice'), true);
    assert.equal(isAdviceRequest('some advice'), true);
    assert.equal(isAdviceRequest("what's your advice"), true);
    assert.equal(isAdviceRequest('what is your advice'), true);
    assert.equal(isAdviceRequest('do you have any advice'), true);

    // Bare request handling ("Kevo, give me advice please")
    assert.equal(isAdviceRequest('kevo, give me advice please'), true);
    assert.equal(isAdviceRequest('can you give me advice please'), true);

    // Non-matches
    assert.equal(isAdviceRequest('what time is it'), false);
    assert.equal(isAdviceRequest('tell me a joke'), false);
    assert.equal(isAdviceRequest('tell me a fact'), false);
  });

  it('returns local offline advice when offline', async () => {
    const advice = await randomAdvice(false);
    assert.ok(LOCAL_ADVICE.includes(advice));
  });

  it('fetches online advice when online and available', async () => {
    const fetchFn = mockAdviceFetch('Always backup your files.');
    const advice = await randomAdvice(true, fetchFn);
    assert.equal(advice, 'Always backup your files.');
  });

  it('falls back to local advice when online fetch fails', async () => {
    const fetchFn: LookupFetch = async () => {
      throw new Error('Network error');
    };
    const advice = await randomAdvice(true, fetchFn);
    assert.ok(LOCAL_ADVICE.includes(advice));
  });

  it('integrates with JarvisVoiceAgent', async () => {
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      onlineLookupsEnabled: () => false,
    });

    const res = await agent.processVoiceInput('Kevo, give me some advice');
    assert.equal(res.handled, true);
    assert.equal(res.actionName, 'random_advice');
    assert.ok(LOCAL_ADVICE.includes(res.speechReply));
    assert.equal(res.status, 'success');
  });

  it('executes random_advice action via executeKevoAction', async () => {
    const ctx = {
      switchView: () => {},
      onlineLookupsEnabled: () => false,
    };
    const res = await executeKevoAction('random_advice', {}, ctx);
    assert.equal(res.handled, true);
    assert.equal(res.actionName, 'random_advice');
    assert.ok(LOCAL_ADVICE.includes(res.speechReply));
    assert.equal(res.status, 'success');
  });
});
