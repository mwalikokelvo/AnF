import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeKevoAction, getActionByName } from '../src/workspace/jarvis/voice/kevo-actions';
import { wikipediaSummary } from '../src/workspace/jarvis/voice/kevo-wikipedia';
import { parseOnlineLookupsSwitch } from '../src/workspace/jarvis/voice/kevo-online';
import { JarvisVoiceAgent, type JarvisActionContext } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

const ctx = (on: boolean): JarvisActionContext => ({ switchView: () => {}, onlineLookupsEnabled: () => on });

describe('Kevo Wikipedia summary', () => {
  it('is an action Kevo can call', () => {
    assert.equal(getActionByName('wikipedia_summary')?.name, 'wikipedia_summary');
  });

  it('reads the first sentences of the page', async () => {
    const urls: string[] = [];
    const res = await wikipediaSummary('Ada Lovelace', async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ type: 'standard', title: 'Ada Lovelace', extract: 'Ada Lovelace was a mathematician. She wrote the first program. She died in 1852.' }) };
    });
    assert.equal(urls[0], 'https://en.wikipedia.org/api/rest_v1/page/summary/Ada_Lovelace?redirect=true');
    assert.equal(res?.summary, 'Ada Lovelace was a mathematician. She wrote the first program.');
    assert.equal(await wikipediaSummary('Nothing here', async () => ({ ok: false, status: 404, json: async () => ({}) })), null);
  });
});

describe('Kevo online lookups switch', () => {
  it('parses on and off', () => {
    assert.equal(parseOnlineLookupsSwitch('turn on online lookups'), true);
    assert.equal(parseOnlineLookupsSwitch('please switch the online lookups off.'), false);
    assert.equal(parseOnlineLookupsSwitch('allow online lookups'), true);
    assert.equal(parseOnlineLookupsSwitch('what does online mean'), null);
  });

  it('keeps every online lookup off until it is turned on', async () => {
    for (const [name, args] of [['wikipedia_summary', { topic: 'Kenya' }], ['define_word', { word: 'kind' }], ['convert_currency', { amount: 5, from: 'USD', to: 'EUR' }]] as const) {
      const res = await executeKevoAction(name, args, ctx(false));
      assert.equal(res.status, 'failure', name);
      assert.equal(res.reason, 'ONLINE_LOOKUPS_OFF', name);
    }
  });

  it('answers a same-currency request without going online', async () => {
    const res = await executeKevoAction('convert_currency', { amount: 5, from: 'usd', to: 'dollars' }, ctx(true));
    assert.match(res.speechReply ?? '', /5 USD/);
  });

  it('turns lookups on and off by voice', async () => {
    let on = false;
    const agent = new JarvisVoiceAgent({ switchView: () => {}, onlineLookupsEnabled: () => on, setOnlineLookupsEnabled: (v) => { on = v; } });
    const res = await agent.processVoiceInput('Kevo, turn on online lookups');
    assert.equal(res.actionName, 'online_lookups_on');
    assert.equal(on, true);
    await agent.processVoiceInput('turn off online lookups');
    assert.equal(on, false);
  });
});
