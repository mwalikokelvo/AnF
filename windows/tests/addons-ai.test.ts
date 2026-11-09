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
  it('loadCatalogSnapshot parses companion-app manifests from communitybuilds registry', async () => {
    const host = createAddonHost(async (cmd) => {
      if (cmd === 'addons_registry') {
        return [
          {
            id: 'morphe-ytm',
            name: 'YouTube Music Morphe',
            version: '21.30.216',
            type: 'companion-app',
            entry: 'manifest.json',
            sha256: '4bdc633372ce26632456d1ccb96d2b720ee7a735bddb6c726b6c43ac40b74095',
            sourceSig: 'MorpheApp/morphe-cli@v2.0.0',
            downloadUrl: 'https://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/morphe-ytm/manifest.json'
          }
        ];
      }
      return [];
    });

    const catalog = await host.loadCatalogSnapshot();
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].id, 'morphe-ytm');
    assert.equal(catalog[0].type, 'companion-app');
    assert.equal(catalog[0].sourceSig, 'MorpheApp/morphe-cli@v2.0.0');
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
    assert.equal(deepseek.bucketUrl, '', 'no invented URL for a model that cannot be downloaded');
    assert.ok(profiles.find(p => p.id === 'qwen3-0.6b-fast')!.bucketUrl.startsWith('https://huggingface.co/Qwen/'));

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

  it('chatCompletion never fabricates an answer or claims a named model replied', async () => {
    const manager = createLocalAiManager({ systemRamGb: 16 });
    manager.setActiveProfile('deepseek-v4.1-flash');
    assert.equal(manager.getActiveProfile().id, 'deepseek-v4.1-flash');
    await assert.rejects(() => manager.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }), /not connected/);

    const failing = createLocalAiManager({ systemRamGb: 16, invokeFn: async () => { throw new Error('runtime down'); } });
    await assert.rejects(() => failing.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }), /runtime down/);

    const empty = createLocalAiManager({ systemRamGb: 16, invokeFn: async () => ({ text: '  ' }) });
    await assert.rejects(() => empty.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }), /no text/);
  });

  it('answers are labelled with the model file that loads and send only runtime slot names', async () => {
    const seen: string[] = [];
    const invokeFn = async (cmd: string, args: Record<string, unknown>) => { if (cmd !== 'workspace_ask') return []; seen.push(String(args.model)); return { text: 'ok' }; };
    const manager = createLocalAiManager({ systemRamGb: 16, invokeFn });
    manager.setActiveProfile('kimi-k3-thinking');
    const balanced = await manager.chatCompletionWithSource({ messages: [{ role: 'user', content: 'Hi' }] });
    assert.equal(balanced.slot, 'balanced');
    assert.equal(balanced.modelFile, 'model.gguf');
    assert.ok(!/kimi|deepseek/i.test(balanced.label), balanced.label);
    manager.setActiveProfile('deepseek-v4.1-flash');
    const fast = await manager.chatCompletionWithSource({ messages: [{ role: 'user', content: 'Hi' }] });
    assert.equal(fast.slot, 'fast');
    assert.ok(fast.label.includes('model-fast.gguf') && !/deepseek/i.test(fast.label), fast.label);
    assert.deepEqual(seen, ['balanced', 'fast']);
  });

  it('validateHuggingFaceUrl enforces official Hugging Face domain boundaries', () => {
    assert.ok(validateHuggingFaceUrl('https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017'));
    assert.ok(validateHuggingFaceUrl('https://huggingface.co/buckets/mwalikokelvo/flint-bucket/model.gguf'));
    assert.equal(validateHuggingFaceUrl('https://malicious-bucket.com/model.gguf'), false);
    assert.equal(validateHuggingFaceUrl('not-a-url'), false);
  });

  it('downloadWeights enforces RAM, then reports placeholder profiles as not available yet without fake progress', async () => {
    const lowRamManager = createLocalAiManager({ systemRamGb: 4 });
    await assert.rejects(async () => {
      await lowRamManager.downloadWeights('deepseek-v4.1-flash', () => {});
    }, /Insufficient system RAM/);

    for (const p of OFFICIAL_PROFILES) {
      assert.equal(p.downloadStatus === 'available', p.family === 'qwen', p.id);
    }
    const highRamManager = createLocalAiManager({ systemRamGb: 16 });
    const progressLog: number[] = [];
    await assert.rejects(
      () => highRamManager.downloadWeights('deepseek-v4.1-flash', pct => progressLog.push(pct)),
      /Not available yet/
    );
    assert.deepEqual(progressLog, []);
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
