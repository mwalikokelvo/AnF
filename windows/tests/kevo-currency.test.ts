import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { currencyCode, convertCurrency, formatConversion } from '../src/workspace/jarvis/voice/kevo-currency';

const reply = (status: number, body: unknown) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('Kevo currency conversion', () => {
  it('reads currency words and codes', () => {
    assert.equal(currencyCode('dollars'), 'USD');
    assert.equal(currencyCode('Kenyan shillings'), 'KES');
    assert.equal(currencyCode('eur'), 'EUR');
    assert.equal(currencyCode('constructor'), null);
    assert.equal(currencyCode('apples'), null);
  });

  it('multiplies the amount by the Frankfurter rate', async () => {
    const urls: string[] = [];
    const conv = await convertCurrency(100, 'USD', 'EUR', async (url) => {
      urls.push(url);
      return reply(200, { base: 'USD', quote: 'EUR', rate: 0.925, date: '2026-11-18' })();
    });
    assert.deepEqual(urls, ['https://api.frankfurter.dev/v2/rate/usd/eur']);
    assert.deepEqual(conv, { amount: 100, from: 'USD', to: 'EUR', result: 92.5, date: '2026-11-18' });
  });

  it('returns null for a pair the service does not know, and throws on other errors', async () => {
    assert.equal(await convertCurrency(1, 'USD', 'XYZ', reply(404, {})), null);
    await assert.rejects(convertCurrency(1, 'USD', 'EUR', reply(500, {})), /answered 500/);
    await assert.rejects(convertCurrency(1, 'USD', 'EUR', async () => { throw new Error('offline'); }), /did not answer/);
  });

  it('formats conversion', () => {
    const text = formatConversion({ amount: 100, from: 'USD', to: 'EUR', result: 92.5, date: '2026-11-18' });
    assert.equal(text, '100 USD is about 92.5 EUR (as of 2026-11-18).');
  });
});
