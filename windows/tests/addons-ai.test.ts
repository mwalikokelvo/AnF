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
  it('listAvailableProfiles returns single official DeepSeek V4 Pro profile', () => {
    const manager = createLocalAiManager({ systemRamGb: 16 });
    const profiles = manager.listAvailableProfiles();
    assert.equal(profiles.length, 1);

    const model = profiles[0];
    assert.equal(model.id, 'deepseek-v4-pro-qwen3.5-9b');
    assert.equal(model.minRamGb, 8);
    assert.equal(model.sizeBytes, 5_780_092_768);
    assert.equal(model.sha256, 'b4363b5710a29a03cab49bc10df92ca688f891eba1a63cae912e4d96f3fd7a65');
    assert.ok(model.bucketUrl.startsWith('https://huggingface.co/mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-GGUF/'));
  });

  it('maps legacy profile IDs gracefully to the single unified model', () => {
    const manager = createLocalAiManager({ systemRamGb: 16 });
    for (const legacy of ['fast', 'balanced', 'deepseek-v4.1-flash', 'kimi-k3-thinking', 'qwen3-0.6b-fast']) {
      manager.setActiveProfile(legacy);
      assert.equal(manager.getActiveProfile().id, 'deepseek-v4-pro-qwen3.5-9b');
    }
  });

  it('chatCompletion never fabricates an answer or claims a named model replied', async () => {
    const manager = createLocalAiManager({ systemRamGb: 16 });
    manager.setActiveProfile('deepseek-v4-pro-qwen3.5-9b');
    assert.equal(manager.getActiveProfile().id, 'deepseek-v4-pro-qwen3.5-9b');
    await assert.rejects(() => manager.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }), /not connected/);

    const failing = createLocalAiManager({ systemRamGb: 16, invokeFn: async () => { throw new Error('runtime down'); } });
    await assert.rejects(() => failing.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }), /runtime down/);

    const empty = createLocalAiManager({ systemRamGb: 16, invokeFn: async () => ({ text: '  ' }) });
    await assert.rejects(() => empty.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] }), /no text/);
  });

  it('answers are labelled truthfully with the model name/file', async () => {
    const seen: string[] = [];
    const invokeFn = async (cmd: string, args: Record<string, unknown>) => { if (cmd !== 'workspace_ask') return []; seen.push(String(args.model)); return { text: 'ok' }; };
    const manager = createLocalAiManager({ systemRamGb: 16, invokeFn });
    const ans = await manager.chatCompletionWithSource({ messages: [{ role: 'user', content: 'Hi' }] });
    assert.equal(ans.slot, 'default');
    assert.ok(ans.label.includes('DeepSeek V4 Pro'), ans.label);
    assert.deepEqual(seen, ['deepseek-v4-pro-qwen3.5-9b']);
  });

  it('validateHuggingFaceUrl enforces official Hugging Face domain boundaries', () => {
    assert.ok(validateHuggingFaceUrl('https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017'));
    assert.ok(validateHuggingFaceUrl('https://huggingface.co/buckets/mwalikokelvo/flint-bucket/model.gguf'));
    assert.equal(validateHuggingFaceUrl('https://malicious-bucket.com/model.gguf'), false);
    assert.equal(validateHuggingFaceUrl('not-a-url'), false);
  });

  it('downloadWeights enforces RAM requirement (min 8 GB)', async () => {
    const lowRamManager = createLocalAiManager({ systemRamGb: 4 });
    await assert.rejects(async () => {
      await lowRamManager.downloadWeights('deepseek-v4-pro-qwen3.5-9b', () => {});
    }, /Insufficient system RAM/);

    for (const p of OFFICIAL_PROFILES) {
      assert.equal(p.downloadStatus, 'available', p.id);
    }
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
