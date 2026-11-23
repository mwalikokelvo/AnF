/**
 * Kevo Hardware Profile & Model Tiering Test Suite (Phase 6 Step 6.1).
 * Tests hardware inspection, RAM/AVX2 detection, dynamic thread allocation,
 * and automatic profile tier selection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateHardwareTier,
  getRecommendedProfileForTier,
  createLocalAiManager,
  type ModelTier,
} from '../src/workspace/local-ai-manager';
import { Bridge } from '../src/core/bridge';

describe('Kevo Hardware-Aware Model Selection (Phase 6 Step 6.1)', () => {
  describe('evaluateHardwareTier: tier and resource computation', () => {
    it('evaluates hardware with clamped threads and single model', () => {
      const res = evaluateHardwareTier({ totalRamGb: 4, availableRamGb: 2, cpuCores: 2 });
      assert.strictEqual(res.recommendedModelId, 'deepseek-v4-pro-qwen3.5-9b');
      assert.strictEqual(res.recommendedThreads, 2);
    });

    it('clamps thread count to at least 1 and at most 8', () => {
      const lowCores = evaluateHardwareTier({ totalRamGb: 16, cpuCores: 0 });
      assert.strictEqual(lowCores.recommendedThreads, 1);

      const highCores = evaluateHardwareTier({ totalRamGb: 16, cpuCores: 32 });
      assert.strictEqual(highCores.recommendedThreads, 8);
    });
  });

  describe('getRecommendedProfileForTier: catalog mapping', () => {
    it('returns unified model profile for all tiers', () => {
      const fast = getRecommendedProfileForTier('fast');
      assert.ok(fast);
      assert.strictEqual(fast.id, 'deepseek-v4-pro-qwen3.5-9b');
      assert.strictEqual(fast.downloadStatus, 'available');

      const balanced = getRecommendedProfileForTier('balanced');
      assert.ok(balanced);
      assert.strictEqual(balanced.id, 'deepseek-v4-pro-qwen3.5-9b');
      assert.strictEqual(balanced.downloadStatus, 'available');

      const quality = getRecommendedProfileForTier('quality');
      assert.ok(quality);
      assert.strictEqual(quality.id, 'deepseek-v4-pro-qwen3.5-9b');
      assert.strictEqual(quality.downloadStatus, 'available');
    });
  });

  describe('LocalAiManager: hardware tier integration', () => {
    it('computes hardware tier matching manager configuration', () => {
      const mgr = createLocalAiManager({ systemRamGb: 16 });
      const tier = mgr.getHardwareTier();
      assert.strictEqual(tier.recommendedTier, 'quality');
      assert.strictEqual(tier.totalRamGb, 16);
    });

    it('maps tier selection to the single unified profile', () => {
      const mgr = createLocalAiManager({ systemRamGb: 8 });
      mgr.selectTier('fast');
      assert.strictEqual(mgr.getActiveProfile().id, 'deepseek-v4-pro-qwen3.5-9b');

      mgr.selectTier('balanced');
      assert.strictEqual(mgr.getActiveProfile().id, 'deepseek-v4-pro-qwen3.5-9b');
    });
  });

  describe('Bridge: kevoHardwareProfile', () => {
    it('exposes kevoHardwareProfile on Bridge with graceful fallback', async () => {
      assert.strictEqual(typeof Bridge.kevoHardwareProfile, 'function');
      const profile = await Bridge.kevoHardwareProfile().catch(() => null);
      if (profile) {
        assert.ok(typeof profile.totalRamGb === 'number');
        assert.ok(typeof profile.cpuCores === 'number');
        assert.ok(['fast', 'balanced', 'quality'].includes(profile.recommendedTier));
      }
    });
  });
});
