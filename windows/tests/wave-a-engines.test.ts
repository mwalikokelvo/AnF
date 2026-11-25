import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BpeTokenizer, SPECIAL_TOKENS } from '../src/workspace/ai/bpe-tokenizer.js';
import { ContextCompactor } from '../src/workspace/ai/context-compactor.js';
import { AgentDagScheduler } from '../src/workspace/ai/agent-dag.js';
import { KvCacheManager } from '../src/workspace/ai/kv-cache-manager.js';
import { InvidiousInstancePool } from '../src/workspace/media/invidious-pool.js';

describe('Wave A: Autonomous Agent & Intelligence Infrastructure', () => {
  test('BpeTokenizer encodes, decodes with special tokens and computes saliency', () => {
    const tokenizer = new BpeTokenizer();
    const prompt = '<|im_start|>system\nYou are a helpful assistant.<|im_end|>';
    const ids = tokenizer.encode(prompt);

    assert.ok(ids.length > 5);
    assert.equal(ids[0], SPECIAL_TOKENS['<|im_start|>']);

    const decoded = tokenizer.decode(ids);
    assert.ok(decoded.includes('<|im_start|>'));
    assert.ok(decoded.includes('helpful assistant'));
    assert.ok(decoded.includes('<|im_end|>'));

    const saliency = tokenizer.computeSaliencyMap('Quantum entanglement requires non-local correlation between particles.');
    assert.ok(saliency.length > 3);
    assert.ok(saliency.some(s => s.importanceScore > 0.5));
  });

  test('ContextCompactor compacts older turns while preserving core entities and directives', () => {
    const compactor = new ContextCompactor({ maxRecentTurns: 2, targetTokenLimit: 50 });
    const messages = [
      { role: 'user' as const, content: 'My name is Alice and I must always receive answers in concise Markdown.' },
      { role: 'assistant' as const, content: 'Understood, Alice. I will always answer in concise Markdown.' },
      { role: 'user' as const, content: 'What is the capital of France?' },
      { role: 'assistant' as const, content: 'The capital of France is Paris.' },
      { role: 'user' as const, content: 'What about Germany?' },
      { role: 'assistant' as const, content: 'The capital of Germany is Berlin.' }
    ];

    const result = compactor.compact(messages);
    assert.equal(result.compactedCount, 3); // 1 summary system block + 2 recent turns
    assert.ok(result.compactedMessages[0].content.includes('Context Compaction Memory'));
    assert.ok(result.extractedEntities.some(e => e.includes('must always') || e.includes('concise Markdown') || e.includes('France')));
  });

  test('AgentDagScheduler resolves task dependencies and enforces budget throttle gate', () => {
    const scheduler = new AgentDagScheduler({ dailyTokenCap: 5000, dailyEnergyMwhCap: 20 });

    scheduler.addTask({ id: 'task_outline', title: 'Draft research outline', assignedAgentRole: 'director' });
    scheduler.addTask({ id: 'task_search', title: 'Search literature', assignedAgentRole: 'researcher', dependsOn: ['task_outline'] });
    scheduler.addTask({ id: 'task_audit', title: 'Audit methodology', assignedAgentRole: 'critic', dependsOn: ['task_search'] });

    assert.equal(scheduler.hasCycle(), false);

    // Initial ready tasks: only task_outline
    let ready = scheduler.getReadyTasks();
    assert.equal(ready.length, 1);
    assert.equal(ready[0].id, 'task_outline');

    // Complete task_outline
    scheduler.completeTask('task_outline', 'Outline drafted.', 1000, 3);

    // Next ready: task_search
    ready = scheduler.getReadyTasks();
    assert.equal(ready.length, 1);
    assert.equal(ready[0].id, 'task_search');

    // Complete task_search with tokens exceeding remaining cap (4500 tokens, total 5500 > 5000)
    scheduler.completeTask('task_search', 'Literature gathered.', 4500, 18);
    assert.equal(scheduler.isThrottled, true);

    // Throttled: ready tasks should be empty
    assert.equal(scheduler.getReadyTasks().length, 0);
  });

  test('KvCacheManager evicts middle tokens while preserving attention sinks and heavy hitters', () => {
    const manager = new KvCacheManager({
      maxCacheTokens: 16,
      sinkTokens: 3,
      heavyHitterTokens: 3
    });

    // Push 30 tokens
    const tokens = [];
    for (let i = 0; i < 30; i++) {
      tokens.push({ id: 100 + i, attentionScore: i === 10 ? 99.0 : 1.0 });
    }
    manager.pushTokens(tokens);

    const retained = manager.getRetainedTokenIndices();
    assert.ok(retained.length <= 16);

    // Initial 3 sink tokens must be retained
    assert.ok(retained.includes(0));
    assert.ok(retained.includes(1));
    assert.ok(retained.includes(2));

    // Token 10 had a massive attention score (heavy hitter) and must be retained
    assert.ok(retained.includes(10));

    const report = manager.getReport();
    assert.equal(report.totalTokensSeen, 30);
    assert.ok(report.evictedTokens >= 14);
    assert.ok(report.memorySavedMb >= 0);
  });

  test('InvidiousInstancePool ranks instances by latency and auto-fails over on failure', async () => {
    const pool = new InvidiousInstancePool([
      'https://fast.invidious.test',
      'https://slow.invidious.test'
    ]);

    pool.recordSuccess('https://fast.invidious.test', 80);
    pool.recordSuccess('https://slow.invidious.test', 400);

    const best = pool.getBestInstance();
    assert.equal(best.uri, 'https://fast.invidious.test');

    // Test failover execution: first instance throws, second succeeds
    let attempts = 0;
    const result = await pool.executeWithFailover(async (baseUri) => {
      attempts++;
      if (baseUri.includes('fast')) {
        throw new Error('HTTP 429 Too Many Requests');
      }
      return 'OK from ' + baseUri;
    });

    assert.equal(attempts, 2);
    assert.ok(result.includes('slow'));
  });
});
