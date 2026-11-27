import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTopHeadlines, formatHeadlines } from '../src/workspace/jarvis/voice/kevo-news';

const reply = (status: number, body: unknown) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('Kevo news headlines', () => {
  it('fetches and formats top stories', async () => {
    let calls = 0;
    const headlines = await getTopHeadlines(2, async (url) => {
      calls++;
      if (url.endsWith('topstories.json')) return reply(200, [101, 102])();
      if (url.includes('/101.json')) return reply(200, { title: 'First story', score: 100, url: 'https://example.com' })();
      return reply(200, { title: 'Second story', score: 50 })();
    });
    assert.equal(headlines.length, 2);
    assert.equal(headlines[0].title, 'First story');
    assert.ok(calls >= 2);
  });

  it('formats a spoken summary', () => {
    const text = formatHeadlines([
      { title: 'Alpha', score: 200 },
      { title: 'Beta' },
    ]);
    assert.match(text, /1\. Alpha \(200 points\)/);
    assert.match(text, /2\. Beta/);
  });
});
