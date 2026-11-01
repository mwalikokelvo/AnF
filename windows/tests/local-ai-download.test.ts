import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createLocalAiManager,
  describeInstall,
  isDownloadable,
  OFFICIAL_PROFILES,
  type DownloadEvent,
  type ListenFn,
  type ModelStatus,
} from '../src/workspace/local-ai-manager.js';

const rust = readFileSync(new URL('../src-tauri/src/model_download/policy.rs', import.meta.url), 'utf8');
const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));

/** Entries of `MODELS` in policy.rs, parsed from source so the TS catalog cannot drift from Rust. */
function rustManifest() {
  const out: Array<{ id: string; file: string; url: string; sha256: string; size: number }> = [];
  const re = /ModelSpec\s*\{\s*id:\s*"([^"]+)",\s*file:\s*"([^"]+)",\s*url:\s*"([^"]+)",\s*sha256:\s*"([^"]+)",\s*size:\s*([\d_]+),/g;
  for (const m of rust.matchAll(re)) out.push({ id: m[1], file: m[2], url: m[3], sha256: m[4], size: Number(m[5].replace(/_/g, '')) });
  return out;
}

const status = (over: Partial<ModelStatus> = {}): ModelStatus => ({
  id: 'qwen3-0.6b-fast', file: 'Qwen3-0.6B-Q8_0.gguf', size: 639_446_688, sha256: 'x', slot: 'fast', state: 'absent', partial_bytes: 0, downloading: false, ...over,
});

function fakeRuntime(opts: { fail?: string } = {}) {
  const handlers: Array<(e: DownloadEvent) => void> = [];
  const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
  let unlistened = 0;
  const listenFn: ListenFn = async (_event, handler) => { handlers.push(handler); return () => { unlistened++; }; };
  const emit = (e: Partial<DownloadEvent>) => handlers.forEach(h => h({ id: 'qwen3-0.6b-fast', phase: 'downloading', done: 0, total: 1000, ...e }));
  const invokeFn = async (cmd: string, args: Record<string, unknown>) => {
    calls.push({ cmd, args });
    if (cmd === 'local_ai_download') {
      emit({ phase: 'downloading', done: 100 });
      emit({ id: 'someone-else', phase: 'downloading', done: 900 });
      emit({ phase: 'downloading', done: 100 }); // duplicate pct is not re-reported
      emit({ phase: 'downloading', done: 500 });
      emit({ phase: 'downloading', done: 1000 });
      emit({ phase: 'verifying', done: 1000 });
      if (opts.fail) { emit({ phase: 'failed', error: opts.fail }); throw new Error(opts.fail); }
      emit({ phase: 'ready', done: 1000 });
      return undefined;
    }
    return undefined;
  };
  return { invokeFn, listenFn, calls, unlistened: () => unlistened };
}

describe('verified local-AI download: catalog honesty', () => {
  it('TS catalog matches the Rust manifest exactly (id, url, sha256, size)', () => {
    const manifest = rustManifest();
    assert.equal(manifest.length, 2, 'both models are parsed from policy.rs');
    for (const m of manifest) {
      const p = OFFICIAL_PROFILES.find(x => x.id === m.id);
      assert.ok(p, m.id);
      assert.equal(p.sha256, m.sha256);
      assert.equal(p.bucketUrl, m.url);
      assert.equal(p.sizeBytes, m.size);
      assert.equal(p.downloadStatus, 'available');
      assert.ok(m.url.endsWith('/' + m.file));
    }
  });

  it('only profiles with a real hash and file are available; no placeholder hashes remain', () => {
    const manifestIds = new Set(rustManifest().map(m => m.id));
    for (const p of OFFICIAL_PROFILES) {
      if (manifestIds.has(p.id)) continue;
      assert.equal(p.downloadStatus, 'not-available-yet', p.id);
      assert.equal(p.sha256, '', `${p.id} must not carry an invented hash`);
      assert.equal(p.bucketUrl, '', `${p.id} must not carry an invented URL`);
    }
    for (const p of OFFICIAL_PROFILES.filter(x => x.downloadStatus === 'available')) {
      assert.match(p.sha256, /^[0-9a-f]{64}$/);
      assert.ok(!/^([0-9a-f])\1{15,}/.test(p.sha256) && !p.sha256.startsWith('e3b0c442'), 'not a repeated-digit or empty-input placeholder');
    }
    const known = { sha256: 'a'.repeat(64), sizeBytes: 1 };
    assert.equal(isDownloadable({ ...OFFICIAL_PROFILES[5], ...known, bucketUrl: 'https://evil.example/x.gguf' }), false);
    assert.equal(isDownloadable({ ...OFFICIAL_PROFILES[5], ...known, bucketUrl: 'http://huggingface.co/x.gguf' }), false);
    assert.equal(isDownloadable({ ...OFFICIAL_PROFILES[5], ...known, sha256: 'XYZ', bucketUrl: 'https://huggingface.co/x.gguf' }), false);
    assert.equal(isDownloadable({ ...OFFICIAL_PROFILES[5], ...known, sizeBytes: 0, bucketUrl: 'https://huggingface.co/x.gguf' }), false);
  });

  it('keeps the webview CSP closed to Hugging Face: downloads go through Rust', () => {
    const csp: string = conf.app.security.csp;
    assert.ok(!/huggingface\.co|hf\.co/.test(csp));
    assert.ok(!rust.includes('tauri_plugin_http'), 'no webview http plugin');
  });
});

describe('verified local-AI download: manager behaviour', () => {
  it('sends only the profile id to Rust (never a URL or hash) and settles after verification', async () => {
    const rt = fakeRuntime();
    const manager = createLocalAiManager({ systemRamGb: 16, invokeFn: rt.invokeFn, listenFn: rt.listenFn });
    const pcts: number[] = [];
    const phases: string[] = [];
    await manager.downloadWeights('qwen3-0.6b-fast', p => pcts.push(p), e => phases.push(e.phase));
    assert.deepEqual(rt.calls, [{ cmd: 'local_ai_download', args: { id: 'qwen3-0.6b-fast' } }]);
    assert.deepEqual(pcts, [10, 50, 99, 100], 'other models and duplicates are ignored; 100 only after ready');
    assert.deepEqual(phases, ['downloading', 'downloading', 'downloading', 'downloading', 'verifying', 'ready']);
    assert.equal(rt.unlistened(), 1);
  });

  it('a failed verification rejects with the reason, never reports 100, and cleans up its listener', async () => {
    const rt = fakeRuntime({ fail: 'Checksum mismatch: the file was deleted and not installed.' });
    const manager = createLocalAiManager({ systemRamGb: 16, invokeFn: rt.invokeFn, listenFn: rt.listenFn });
    const pcts: number[] = [];
    await assert.rejects(() => manager.downloadWeights('qwen3-0.6b-fast', p => pcts.push(p)), /Checksum mismatch/);
    assert.ok(!pcts.includes(100));
    assert.equal(rt.unlistened(), 1);
  });

  it('refuses unavailable profiles, low RAM and a missing download service without any progress', async () => {
    const rt = fakeRuntime();
    const m = createLocalAiManager({ systemRamGb: 16, invokeFn: rt.invokeFn, listenFn: rt.listenFn });
    await assert.rejects(() => m.downloadWeights('kimi-k3-thinking', () => { throw new Error('no progress'); }), /Not available yet/);
    await assert.rejects(() => m.downloadWeights('nope', () => {}), /Unknown/);
    const low = createLocalAiManager({ systemRamGb: 2, invokeFn: rt.invokeFn, listenFn: rt.listenFn });
    await assert.rejects(() => low.downloadWeights('qwen3-1.7b-balanced', () => {}), /Insufficient system RAM/);
    const bare = createLocalAiManager({ systemRamGb: 16 });
    await assert.rejects(() => bare.downloadWeights('qwen3-0.6b-fast', () => {}), /not connected/);
    assert.equal(rt.calls.length, 0);
  });

  it('cancel and status go through the Rust commands', async () => {
    const seen: string[] = [];
    const m = createLocalAiManager({ invokeFn: async (cmd) => { seen.push(cmd); return cmd === 'local_ai_models' ? [status()] : true; } });
    assert.equal(await m.cancelDownload('qwen3-0.6b-fast'), true);
    assert.equal((await m.getInstallStatus())[0].state, 'absent');
    assert.deepEqual(seen, ['local_ai_download_cancel', 'local_ai_models']);
    assert.deepEqual(await createLocalAiManager().getInstallStatus(), []);
  });
});

describe('verified local-AI download: honest labels', () => {
  const ask = { messages: [{ role: 'user', content: 'Hi' }] };
  const make = (models: unknown) => createLocalAiManager({
    invokeFn: async cmd => (cmd === 'local_ai_models' ? models : { text: 'hello' }),
  });

  it('shows the real model file only when a verified model serves the slot', async () => {
    const m = make([status({ state: 'installed' }), status({ id: 'qwen3-1.7b-balanced', file: 'Qwen3-1.7B-Q8_0.gguf', slot: 'balanced' })]);
    m.setActiveProfile('qwen3-0.6b-fast');
    const fast = await m.chatCompletionWithSource(ask);
    assert.equal(fast.modelFile, 'Qwen3-0.6B-Q8_0.gguf');
    assert.equal(fast.label, 'Offline model · Qwen3-0.6B-Q8_0.gguf (SHA-256 verified)');
    m.setActiveProfile('qwen3-1.7b-balanced');
    const balanced = await m.chatCompletionWithSource(ask);
    assert.equal(balanced.modelFile, 'model.gguf', 'a not-installed 1.7B must not be claimed');
    assert.ok(!/Q8_0|verified/.test(balanced.label));
  });

  it('partial or unverified files never unlock the real label; a failing status call falls back safely', async () => {
    for (const state of ['partial', 'unverified', 'absent'] as const) {
      const m = make([status({ state })]);
      m.setActiveProfile('qwen3-0.6b-fast');
      assert.ok(!/Q8_0|verified/.test((await m.chatCompletionWithSource(ask)).label), state);
    }
    const broken = createLocalAiManager({ invokeFn: async cmd => { if (cmd === 'local_ai_models') throw new Error('x'); return { text: 'hello' }; } });
    broken.setActiveProfile('qwen3-0.6b-fast');
    assert.ok((await broken.chatCompletionWithSource(ask)).label.includes('model-fast.gguf'));
  });

  it('state text is honest at every step', () => {
    const p = OFFICIAL_PROFILES.find(x => x.id === 'qwen3-0.6b-fast')!;
    const ev = (e: Partial<DownloadEvent>): DownloadEvent => ({ id: p.id, phase: 'downloading', done: 0, total: 1000, ...e });
    assert.equal(describeInstall(OFFICIAL_PROFILES.find(x => x.id === 'kimi-k3-thinking')!, undefined), 'Not available yet');
    assert.match(describeInstall(p, status()), /^Not downloaded/);
    assert.match(describeInstall(p, status({ state: 'partial', partial_bytes: 1e8 })), /Not installed.*resume/);
    assert.match(describeInstall(p, status({ state: 'unverified' })), /Not installed/);
    assert.equal(describeInstall(p, status({ state: 'installed' })), 'Ready: SHA-256 verified');
    assert.match(describeInstall(p, status(), ev({ done: 250 })), /^Downloading 25%/);
    assert.match(describeInstall(p, status(), ev({ phase: 'verifying', done: 1000 })), /^Verifying.*not installed yet/);
    assert.equal(describeInstall(p, status(), ev({ phase: 'ready' })), 'Ready: SHA-256 verified');
    assert.match(describeInstall(p, status(), ev({ phase: 'failed', error: 'Checksum mismatch' })), /^Failed: Checksum mismatch/);
    assert.match(describeInstall(p, status(), ev({ phase: 'cancelled' })), /^Cancelled/);
    assert.ok(!/Ready/.test(describeInstall(p, status({ state: 'partial', partial_bytes: 5 }))));
  });
});
