import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendJarvisTurn,
  clearJarvisHistory,
  formatJarvisHistoryForPrompt,
  getJarvisHistory,
  healHistory,
  rememberFact,
  listFacts,
  deleteFact,
  clearFacts,
  formatRememberedFactsForPrompt,
  syncJarvisHistoryFromNative,
  type JarvisTurn,
  type KevoFact,
} from '../src/workspace/jarvis/voice/jarvis-memory.js';
import { Bridge } from '../src/core/bridge.js';

describe('Kevo conversational memory', () => {
  beforeEach(() => {
    clearJarvisHistory();
  });

  it('stores turns and formats a prompt transcript', () => {
    appendJarvisTurn('user', 'What time is rehearsal?');
    appendJarvisTurn('assistant', 'I do not have your calendar, sir.');
    const hist = getJarvisHistory();
    assert.equal(hist.length, 2);
    const prompt = formatJarvisHistoryForPrompt();
    assert.match(prompt, /User: What time is rehearsal\?/);
    assert.match(prompt, /Kevo: I do not have your calendar/);
  });

  it('drops a saved history where Kevo answered itself in a loop, and keeps ordinary repeats', () => {
    const turn = (role: 'user' | 'assistant', text: string) => ({ role, text, at: 0 });
    const long = 'I see that you are having trouble with the offline runtime. Could you check the system requirements again?';
    assert.deepEqual(healHistory([turn('user', 'hi'), turn('assistant', long), turn('user', long), turn('assistant', long)]), []);
    const normal = [turn('user', 'a'), turn('assistant', 'I do not have your calendar, sir.'), turn('user', 'b'), turn('assistant', 'I do not have your calendar, sir.')];
    assert.equal(healHistory(normal), normal);
    const apart = [turn('assistant', long), turn('assistant', 'Something else entirely.'), turn('assistant', long)];
    assert.equal(healHistory(apart), apart);
  });

  it('keeps only the last 20 turns', () => {
    for (let i = 0; i < 25; i++) {
      appendJarvisTurn('user', `msg-${i}`);
      appendJarvisTurn('assistant', `ack-${i}`);
    }
    assert.equal(getJarvisHistory().length, 20);
    assert.equal(getJarvisHistory()[0].text, 'msg-15');
  });

  it('remembers facts, lists them, and supports category queries', async () => {
    await clearFacts();

    const fact1 = await rememberFact('Prefers dark chocolate', 'diet');
    assert.strictEqual(fact1.fact, 'Prefers dark chocolate');
    assert.strictEqual(fact1.category, 'diet');
    assert.ok(fact1.id.startsWith('fact_'));

    const fact2 = await rememberFact('Writes code in TypeScript');
    assert.strictEqual(fact2.category, 'general');

    const all = await listFacts();
    assert.strictEqual(all.length, 2);

    const filtered = await listFacts('chocolate');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, fact1.id);
  });

  it('deletes specific facts and clears all facts', async () => {
    await clearFacts();
    const fact = await rememberFact('Temporary memory');
    assert.strictEqual((await listFacts()).length, 1);

    const deleted = await deleteFact(fact.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual((await listFacts()).length, 0);

    await rememberFact('Memory 1');
    await rememberFact('Memory 2');
    assert.strictEqual((await listFacts()).length, 2);

    const cleared = await clearFacts();
    assert.strictEqual(cleared, true);
    assert.strictEqual((await listFacts()).length, 0);
  });

  it('formats remembered facts cleanly for prompt injection', () => {
    const facts: KevoFact[] = [
      { id: '1', fact: 'Likes jazz', category: 'music', created_at: 1, updated_at: 1 },
      { id: '2', fact: 'Uses Windows 11', category: 'device', created_at: 2, updated_at: 2 },
    ];
    const promptSection = formatRememberedFactsForPrompt(facts);
    assert.match(promptSection, /# Remembered Facts/);
    assert.match(promptSection, /- \[music\] Likes jazz/);
    assert.match(promptSection, /- \[device\] Uses Windows 11/);
  });

  it('syncs history from native Bridge when available', async () => {
    clearJarvisHistory();
    const orig = Bridge.kevoMemoryLoadHistory;
    const origWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        __TAURI__: { core: { invoke: async () => {} } },
      };
      Bridge.kevoMemoryLoadHistory = async (limit?: number) => [
        { id: 't1', role: 'user', text: 'Restored turn', at: 12345 },
        { id: 't2', role: 'assistant', text: 'Restored reply', at: 12346 },
      ];
      await syncJarvisHistoryFromNative();
      const history = getJarvisHistory();
      assert.strictEqual(history.length, 2);
      assert.strictEqual(history[0].text, 'Restored turn');
      assert.strictEqual(history[1].text, 'Restored reply');
    } finally {
      Bridge.kevoMemoryLoadHistory = orig;
      (globalThis as any).window = origWindow;
    }
  });

  it('survives simulated restart and permanently removes deleted facts from prompts', async () => {
    await clearFacts();
    const fact1 = await rememberFact('Likes green tea', 'beverage');
    const fact2 = await rememberFact('Lives in Nairobi', 'location');

    let currentFacts = await listFacts();
    assert.strictEqual(currentFacts.length, 2);
    let prompt = formatRememberedFactsForPrompt(currentFacts);
    assert.match(prompt, /Likes green tea/);
    assert.match(prompt, /Lives in Nairobi/);

    // Delete fact1
    const deleted = await deleteFact(fact1.id);
    assert.strictEqual(deleted, true);

    // Verify deleted fact never appears in list or prompt
    currentFacts = await listFacts();
    assert.strictEqual(currentFacts.length, 1);
    assert.strictEqual(currentFacts[0].id, fact2.id);
    prompt = formatRememberedFactsForPrompt(currentFacts);
    assert.doesNotMatch(prompt, /Likes green tea/);
    assert.match(prompt, /Lives in Nairobi/);
  });

  it('gracefully recovers from corrupted or failing native memory bridge responses', async () => {
    const origList = Bridge.kevoMemoryListFacts;
    const origWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        __TAURI__: { core: { invoke: async () => {} } },
      };
      // Bridge throws or returns corrupted non-array data
      Bridge.kevoMemoryListFacts = async () => {
        throw new Error('Corrupted memory file');
      };
      // Should not throw, should fall back to local store
      const facts = await listFacts();
      assert.ok(Array.isArray(facts));
    } finally {
      Bridge.kevoMemoryListFacts = origList;
      (globalThis as any).window = origWindow;
    }
  });
});
