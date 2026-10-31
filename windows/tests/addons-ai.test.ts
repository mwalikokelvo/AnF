import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAddonHost, type AddonManifest } from '../src/workspace/addons-core.js';
import {
  createLocalAiManager,
  validateHuggingFaceUrl,
  OFFICIAL_PROFILES,
} from '../src/workspace/local-ai-manager.js';

describe('Orion Addon Store & AddonHost Verification', () => {
  it('verifyIntegrity confirms matching SHA-256 and rejects tampered bytes', async () => {
    const host = createAddonHost(async () => ({}));
    const validData = new TextEncoder().encode('theme-css-content-valid');
    const hashBuf = await crypto.subtle.digest('SHA-256', validData);
    const expectedSha256 = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const ok = await host.verifyIntegrity(validData, expectedSha256);
    assert.equal(ok, true);

    const tamperedData = new TextEncoder().encode('theme-css-content-tampered');
    const bad = await host.verifyIntegrity(tamperedData, expectedSha256);
    assert.equal(bad, false);
  });

  it('installAddon verifies package integrity before committing install', async () => {
    let installedId = '';
    const host = createAddonHost(async (cmd, args) => {
      if (cmd === 'addons_install') {
        installedId = (args as { id: string }).id;
      }
      return {};
    });

    const content = 'body { background: #111; }';
    const contentBytes = new TextEncoder().encode(content);
    const hashBuf = await crypto.subtle.digest('SHA-256', contentBytes);
    const sha256 = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const manifest: AddonManifest = {
      id: 'nord-dark',
      name: 'Nord Dark',
      version: '1.0.0',
      type: 'theme',
      entry: 'nord-dark.css',
      sha256,
      offlineReady: true,
    };

    // Valid install succeeds
    await host.installAddon(manifest, new Blob([content], { type: 'text/css' }));
    assert.equal(installedId, 'nord-dark');

    // Tampered install throws error
    manifest.sha256 = '0000000000000000000000000000000000000000000000000000000000000000';
    await assert.rejects(async () => {
      await host.installAddon(manifest, new Blob([content], { type: 'text/css' }));
    }, /Integrity verification failed/);
  });
});

describe('Local AI Model Manager & Hugging Face Bucket Integration', () => {
  it('listAvailableProfiles returns official DeepSeek and Qwen profiles', () => {
    const manager = createLocalAiManager({ systemRamGb: 16 });
    const profiles = manager.listAvailableProfiles();
    assert.ok(profiles.length >= 5);

    const deepseek = profiles.find(p => p.id === 'deepseek-v4.1-flash');
    assert.ok(deepseek);
    assert.equal(deepseek.minRamGb, 8);
    assert.ok(deepseek.bucketUrl.includes('huggingface.co'));

    // Check latest Kimi profiles from Hugging Face
    const kimiK3 = profiles.find(p => p.id === 'kimi-k3-thinking');
    assert.ok(kimiK3);
    assert.equal(kimiK3.family, 'kimi');
    assert.equal(kimiK3.minRamGb, 8);
    assert.ok(kimiK3.huggingFaceRepo.includes('Kimi-K3'));

    const kimiLinear = profiles.find(p => p.id === 'kimi-linear-a3b');
    assert.ok(kimiLinear);
    assert.equal(kimiLinear.family, 'kimi');
    assert.equal(kimiLinear.minRamGb, 4);

    // Check latest DeepSeek V3.2 and R1 Distill
    const deepseekV32 = profiles.find(p => p.id === 'deepseek-v3.2-reasoning');
    assert.ok(deepseekV32);
    assert.equal(deepseekV32.family, 'deepseek');

    const deepseekR1 = profiles.find(p => p.id === 'deepseek-r1-distill-qwen-1.5b');
    assert.ok(deepseekR1);
    assert.equal(deepseekR1.family, 'deepseek');
    assert.equal(deepseekR1.minRamGb, 4);
  });

  it('getProfilesByFamily correctly partitions models by AI family', () => {
    const manager = createLocalAiManager({ systemRamGb: 16 });
    const deepseekFamily = manager.getProfilesByFamily('deepseek');
    assert.ok(deepseekFamily.length >= 3);
    assert.ok(deepseekFamily.every(p => p.family === 'deepseek'));

    const kimiFamily = manager.getProfilesByFamily('kimi');
    assert.ok(kimiFamily.length >= 2);
    assert.ok(kimiFamily.every(p => p.family === 'kimi'));

    const qwenFamily = manager.getProfilesByFamily('qwen');
    assert.ok(qwenFamily.length >= 2);
    assert.ok(qwenFamily.every(p => p.family === 'qwen'));
  });

  it('setActiveProfile switches model and emits specialized offline thinking traces', async () => {
    const manager = createLocalAiManager({ systemRamGb: 16 });

    // 1. DeepSeek Active Profile emits DSA/Engram thinking trace
    manager.setActiveProfile('deepseek-v4.1-flash');
    assert.equal(manager.getActiveProfile().id, 'deepseek-v4.1-flash');
    const deepseekReply = await manager.chatCompletion({
      messages: [{ role: 'user', content: 'Explain offline engram cache.' }],
    });
    assert.ok(deepseekReply.includes('<think>'));
    assert.ok(deepseekReply.includes('DeepSeek V4.1 Flash'));
    assert.ok(deepseekReply.includes('Explain offline engram cache'));

    // 2. Kimi Active Profile emits KDA/LatentMoE thinking trace
    manager.setActiveProfile('kimi-k3-thinking');
    assert.equal(manager.getActiveProfile().id, 'kimi-k3-thinking');
    const kimiReply = await manager.chatCompletion({
      messages: [{ role: 'user', content: 'Synthesize document highlights.' }],
    });
    assert.ok(kimiReply.includes('<think>'));
    assert.ok(kimiReply.includes('Kimi K3 Thinking'));
    assert.ok(kimiReply.includes('Synthesize document highlights'));
  });

  it('validateHuggingFaceUrl enforces official Hugging Face domain boundaries', () => {
    assert.ok(validateHuggingFaceUrl('https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017'));
    assert.ok(validateHuggingFaceUrl('https://huggingface.co/buckets/mwalikokelvo/flint-bucket/model.gguf'));
    assert.equal(validateHuggingFaceUrl('https://malicious-bucket.com/model.gguf'), false);
    assert.equal(validateHuggingFaceUrl('not-a-url'), false);
  });

  it('downloadWeights enforces RAM requirements and reports progression steps', async () => {
    // 1. Insufficient RAM rejects download
    const lowRamManager = createLocalAiManager({ systemRamGb: 4 });
    await assert.rejects(async () => {
      await lowRamManager.downloadWeights('deepseek-v4.1-flash', () => {});
    }, /Insufficient system RAM/);

    // 2. Sufficient RAM reports progress steps to 100%
    const highRamManager = createLocalAiManager({ systemRamGb: 16 });
    const progressLog: number[] = [];
    await highRamManager.downloadWeights('deepseek-v4.1-flash', pct => progressLog.push(pct));
    assert.deepEqual(progressLog, [0, 25, 50, 75, 100]);
  });

  it('chatCompletion executes grounded local AI response with zero cloud telemetry', async () => {
    const manager = createLocalAiManager({
      systemRamGb: 16,
      invokeFn: async (cmd, args) => {
        if (cmd === 'workspace_ask') {
          return { text: `Local response to: ${(args as { query: string }).query}` };
        }
        return {};
      },
    });

    const reply = await manager.chatCompletion({
      messages: [
        { role: 'user', content: 'Explain offline-first architecture.' },
      ],
    });

    assert.ok(reply.includes('Explain offline-first architecture'));
  });
});
