import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isHistoryRequest,
  todayInHistory,
} from '../src/workspace/jarvis/voice/kevo-history';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { executeKevoAction } from '../src/workspace/jarvis/voice/kevo-actions';
import { ONLINE_LOOKUPS_OFF, type LookupFetch } from '../src/workspace/jarvis/voice/kevo-online';

function mockWikipediaFetch(data: unknown, status = 200): LookupFetch {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

describe('Kevo: Today in History', () => {
  it('recognizes history phrases', () => {
    assert.equal(isHistoryRequest('today in history'), true);
    assert.equal(isHistoryRequest('what happened today in history'), true);
    assert.equal(isHistoryRequest('on this day'), true);
    assert.equal(isHistoryRequest('what happened on this day'), true);
    assert.equal(isHistoryRequest('what happened today'), true);
    assert.equal(isHistoryRequest('this day in history'), true);
    assert.equal(isHistoryRequest('history for today'), true);

    // Bare request handling ("Kevo, today in history please")
    assert.equal(isHistoryRequest('kevo, today in history please'), true);
    assert.equal(isHistoryRequest('can you tell me what happened today in history'), true);

    // Non-matches
    assert.equal(isHistoryRequest('what time is it'), false);
    assert.equal(isHistoryRequest('what is the weather today'), false);
    assert.equal(isHistoryRequest('tell me a joke'), false);
  });

  it('fetches and formats historical events', async () => {
    const mockData = {
      events: [
        { year: 1969, text: 'Apollo 12 astronauts Pete Conrad and Alan Bean land on the Ocean of Storms.' },
        { year: 1977, text: 'The Concorde starts regular service between New York and London.' },
        { year: 1995, text: 'Toy Story is released in theatres.' },
      ],
    };

    const result = await todayInHistory(11, 22, mockWikipediaFetch(mockData));
    assert.ok(result);
    assert.ok(result.includes('In 1969, Apollo 12 astronauts'));
    assert.ok(result.includes('In 1977, The Concorde starts regular service'));
    // Limits to 2 events
    assert.ok(!result.includes('Toy Story'));
  });

  it('handles empty or 404 response gracefully', async () => {
    const emptyResult = await todayInHistory(11, 22, mockWikipediaFetch({ events: [] }));
    assert.equal(emptyResult, null);

    await assert.rejects(
      async () => {
        await todayInHistory(11, 22, mockWikipediaFetch({}, 500));
      },
      /Wikipedia answered 500/
    );
  });

  it('integrates with JarvisVoiceAgent respecting onlineLookupsEnabled', async () => {
    let online = true;
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      onlineLookupsEnabled: () => online,
    });

    // When online lookups are disabled
    online = false;
    const resOff = await agent.processVoiceInput('Kevo, today in history');
    assert.equal(resOff.handled, true);
    assert.equal(resOff.actionName, 'today_in_history');
    assert.equal(resOff.speechReply, ONLINE_LOOKUPS_OFF);
  });

  it('executes today_in_history action via executeKevoAction', async () => {
    // When lookups are off
    const ctxOff = {
      switchView: () => {},
      onlineLookupsEnabled: () => false,
    };
    const resOff = await executeKevoAction('today_in_history', {}, ctxOff);
    assert.equal(resOff.handled, true);
    assert.equal(resOff.actionName, 'today_in_history');
    assert.equal(resOff.speechReply, ONLINE_LOOKUPS_OFF);
  });
});
