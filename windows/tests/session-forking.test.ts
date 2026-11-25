import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionTreeManager,
  ComputeEnergyLedger,
  HARDWARE_POWER_WATTS
} from '../src/workspace/ai/session-forking.js';

describe('Session Forking & Compute Energy Ledger (Frontier 5)', () => {
  test('manages linear messages and forks branches at arbitrary checkpoints', () => {
    const tree = new SessionTreeManager('Historical Analysis');
    tree.appendMessage('user', 'What were the consequences of the 1848 revolutions?');
    tree.appendMessage('assistant', 'The revolutions resulted in widespread political reform and nationalist movements across Europe.');
    tree.appendMessage('user', 'Focus on France specifically.');
    tree.appendMessage('assistant', 'In France, it led to the abdication of King Louis Philippe and the Second Republic.');

    assert.equal(tree.getLinearHistory().length, 4);

    // Fork at index 1 (after the general European answer) to explore alternate hypothetical path
    const branch = tree.forkAt(1, 'Hypothetical: Prussia Focus');
    assert.equal(branch.messages.length, 2);
    assert.equal(tree.activeNodeId, branch.id);

    // Append to the fork
    tree.appendMessage('user', 'What happened in the German states and Prussia?');
    tree.appendMessage('assistant', 'The Frankfurt Parliament convened to draft a constitution for a unified Germany.');
    assert.equal(tree.getLinearHistory().length, 4);

    // Switch back to root
    tree.switchToBranch(tree.rootId);
    assert.equal(tree.getLinearHistory().length, 4);
    assert.equal(tree.getLinearHistory()[2].content, 'Focus on France specifically.');

    const outline = tree.exportTreeOutline();
    assert.ok(outline.includes('Historical Analysis'));
    assert.ok(outline.includes('Hypothetical: Prussia Focus'));
  });

  test('computes energy consumption, tokens per second, and model costs', () => {
    const ledger = new ComputeEnergyLedger();

    // 1. Local MiniMind CPU call (250 tokens in 500ms)
    ledger.recordInference({
      model: 'minimind-sub100m',
      provider: 'local-cpu',
      promptTokens: 50,
      completionTokens: 200,
      latencyMs: 500,
      hardwareDevice: 'cpu'
    });

    // 2. DirectML GPU call (600 tokens in 1200ms)
    ledger.recordInference({
      model: 'local-q4',
      provider: 'directml',
      promptTokens: 100,
      completionTokens: 500,
      latencyMs: 1200,
      hardwareDevice: 'directml',
      branchId: 'branch_xyz'
    });

    const summary = ledger.getSummary();
    assert.equal(summary.totalCalls, 2);
    assert.equal(summary.totalPromptTokens, 150);
    assert.equal(summary.totalCompletionTokens, 700);
    assert.equal(summary.totalTokens, 850);
    assert.equal(summary.totalLatencyMs, 1700);
    assert.ok(summary.totalEnergyMwh > 0, 'Energy should be positive mWh');
    assert.ok(summary.tokensPerSecond > 300, 'Throughput should be positive');

    // Cost for local models is 0
    assert.equal(summary.totalCostUsd, 0);

    // Branch filter test
    const branchSummary = ledger.getSummary('branch_xyz');
    assert.equal(branchSummary.totalCalls, 1);
    assert.equal(branchSummary.totalCompletionTokens, 500);
  });
});
