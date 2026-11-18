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
    it('maps low RAM (< 8 GB) to fast tier with clamped threads', () => {
      const res = evaluateHardwareTier({ totalRamGb: 4, availableRamGb: 2, cpuCores: 2 });
      assert.strictEqual(res.recommendedTier, 'fast');
      assert.strictEqual(res.recommendedModelId, 'qwen3-0.6b-fast');
      assert.strictEqual(res.recommendedThreads, 2);
    });

    it('maps balanced RAM (8–15.4 GB) to balanced tier', () => {
      const res = evaluateHardwareTier({ totalRamGb: 8, availableRamGb: 5, cpuCores: 6, avx2Supported: true });
      assert.strictEqual(res.recommendedTier, 'balanced');
      assert.strictEqual(res.recommendedModelId, 'qwen3-1.7b-balanced');
      assert.strictEqual(res.recommendedThreads, 6);
    });

    it('maps high RAM (>= 16 GB) with AVX2 to quality tier', () => {
      const res = evaluateHardwareTier({ totalRamGb: 16, availableRamGb: 10, cpuCores: 16, avx2Supported: true });
      assert.strictEqual(res.recommendedTier, 'quality');
      assert.strictEqual(res.recommendedModelId, 'qwen3-1.7b-balanced');
      assert.strictEqual(res.recommendedThreads, 8); // clamped to max 8 threads
    });

    it('falls back to balanced tier when RAM is high (>= 16 GB) but AVX2 is absent', () => {
      const res = evaluateHardwareTier({ totalRamGb: 32, availableRamGb: 24, cpuCores: 8, avx2Supported: false });
      assert.strictEqual(res.recommendedTier, 'balanced');
      assert.strictEqual(res.avx2Supported, false);
    });

    it('clamps thread count to at least 1 and at most 8', () => {
      const lowCores = evaluateHardwareTier({ totalRamGb: 16, cpuCores: 0 });
      assert.strictEqual(lowCores.recommendedThreads, 1);

      const highCores = evaluateHardwareTier({ totalRamGb: 16, cpuCores: 32 });
      assert.strictEqual(highCores.recommendedThreads, 8);
    });
  });

  describe('getRecommendedProfileForTier: catalog mapping', () => {
    it('returns fast profile for fast tier', () => {
      const p = getRecommendedProfileForTier('fast');
      assert.ok(p);
      assert.strictEqual(p.id, 'qwen3-0.6b-fast');
      assert.strictEqual(p.downloadStatus, 'available');
    });

    it('returns balanced profile for balanced and quality tiers', () => {
      const balanced = getRecommendedProfileForTier('balanced');
      assert.ok(balanced);
      assert.strictEqual(balanced.id, 'qwen3-1.7b-balanced');
      assert.strictEqual(balanced.downloadStatus, 'available');

      const quality = getRecommendedProfileForTier('quality');
      assert.ok(quality);
      assert.strictEqual(quality.id, 'qwen3-1.7b-balanced');
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

    it('allows explicit tier selection switching active profile', () => {
      const mgr = createLocalAiManager({ systemRamGb: 8 });
      mgr.selectTier('fast');
      assert.strictEqual(mgr.getActiveProfile().id, 'qwen3-0.6b-fast');

      mgr.selectTier('balanced');
      assert.strictEqual(mgr.getActiveProfile().id, 'qwen3-1.7b-balanced');
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
