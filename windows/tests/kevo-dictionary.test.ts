import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDefinition, lookupWord, type DictionaryEntry } from '../src/workspace/jarvis/voice/kevo-dictionary';

describe('Kevo dictionary', () => {
  it('formats a definition nicely', () => {
    const entry: DictionaryEntry = {
      word: 'hello',
      phonetic: 'həˈləʊ',
      meanings: [{ partOfSpeech: 'exclamation', definitions: [{ definition: 'used as a greeting.', example: 'hello there' }] }],
    };
    const out = formatDefinition(entry);
    assert.ok(out.includes('hello'));
    assert.ok(out.includes('greeting'));
    assert.ok(out.includes('hello there'));
    assert.ok(!out.includes('həˈləʊ'), 'phonetic symbols are not read aloud');
  });

  it('handles missing phonetic', () => {
    const out = formatDefinition({ word: 'test', meanings: [{ definitions: [{ definition: 'a procedure' }] }] });
    assert.ok(out.includes('test:'));
    assert.ok(out.includes('a procedure'));
  });

  it('looks a word up, and returns null for an unknown word', async () => {
    const urls: string[] = [];
    const entry = await lookupWord('Serendipity?', async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => [{ word: 'serendipity', meanings: [{ definitions: [{ definition: 'luck' }] }] }] };
    });
    assert.equal(urls[0], 'https://api.dictionaryapi.dev/api/v2/entries/en/serendipity');
    assert.equal(entry?.word, 'serendipity');
    assert.equal(await lookupWord('zzqx', async () => ({ ok: false, status: 404, json: async () => ({}) })), null);
  });
});
