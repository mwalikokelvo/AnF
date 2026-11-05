import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractHeadings,
  extractDocumentMetadata,
  isOcrAvailable,
  getOcrStatus,
  normalizeOcrStatus,
  waitForOcrReady,
  launchOcrService,
  configureExternalOcr,
  parseImageBlobWithOcr
} from '../src/workspace/ocr-client.js';

describe('Unlimited-OCR Client & Markdown Document Extractor', () => {
  it('extractHeadings correctly pulls markdown titles, sections, and sub-headings', () => {
    const md = `
# Executive Summary
Some opening remarks.
## Methodological Framework
Details on the method.
### Mathematical Model
Equations here.
#### Detailed Derivation
Step by step.
## Evaluation and Results
Numbers and graphs.
    `;
    const headings = extractHeadings(md);
    assert.deepEqual(headings, [
      'Executive Summary',
      'Methodological Framework',
      'Mathematical Model',
      'Detailed Derivation',
      'Evaluation and Results'
    ]);
  });

  it('extractDocumentMetadata accurately detects tables and LaTeX formulas', () => {
    const md = `
# Quantum Mechanics Overview

Let the state vector be $|\psi\rangle = \alpha|0\rangle + \beta|1\rangle$ where $|\alpha|^2 + |\beta|^2 = 1$.

| State | Probability | Amplitude |
| :--- | :--- | :--- |
| $|0\rangle$ | $|\alpha|^2$ | $\alpha$ |
| $|1\rangle$ | $|\beta|^2$ | $\beta$ |

$$\hat{H}|\psi\rangle = E|\psi\rangle$$
    `;
    const metadata = extractDocumentMetadata(md);
    assert.equal(metadata.headings.length, 1);
    assert.equal(metadata.headings[0], 'Quantum Mechanics Overview');
    assert.equal(metadata.tablesCount, 1);
    assert.equal(metadata.hasFormulas, true);
  });

  const ready = (endpoint = 'http://127.0.0.1:41234/v1') => ({ mode: 'owned', state: 'ready', endpoint });

  it('isOcrAvailable is false when the native status says off or the call throws', async () => {
    assert.equal(await isOcrAvailable(async () => ({ mode: 'off', state: 'off' })), false);
    assert.equal(await isOcrAvailable(async () => { throw new Error('boom'); }), false);
    assert.equal(await isOcrAvailable(async () => ready()), true);
  });

  it('status from native is validated, unknown values collapse to off', () => {
    assert.deepEqual(normalizeOcrStatus({ mode: 'weird', state: 'x' }), { mode: 'off', state: 'off', endpoint: undefined, message: undefined });
    assert.equal(normalizeOcrStatus(null).state, 'off');
    assert.equal(normalizeOcrStatus(ready()).endpoint, 'http://127.0.0.1:41234/v1');
  });

  it('getOcrStatus asks Rust, never the network', async () => {
    const calls: string[] = [];
    const st = await getOcrStatus(async (cmd) => { calls.push(cmd); return ready(); });
    assert.deepEqual(calls, ['ocr_status']);
    assert.equal(st.state, 'ready');
  });

  it('waitForOcrReady retries until Rust reports ready', async () => {
    let attempts = 0;
    const st = await waitForOcrReady({
      timeoutMs: 2000,
      retryIntervalMs: 20,
      invokeFn: async () => (++attempts >= 3 ? ready() : { mode: 'owned', state: 'starting' })
    });
    assert.equal(st.endpoint, 'http://127.0.0.1:41234/v1');
    assert.ok(attempts >= 3);
  });

  it('waitForOcrReady times out and refuses an unconfirmed external server', async () => {
    await assert.rejects(
      waitForOcrReady({ timeoutMs: 60, retryIntervalMs: 20, invokeFn: async () => ({ mode: 'owned', state: 'starting' }) }),
      /failed to respond within 60ms/
    );
    await assert.rejects(
      waitForOcrReady({ timeoutMs: 500, retryIntervalMs: 20, invokeFn: async () => ({ mode: 'external-unconfirmed', state: 'needs-confirmation', endpoint: 'http://127.0.0.1:9001/v1' }) }),
      /not confirmed/
    );
  });

  it('launchOcrService starts via start_ocr_service and returns the endpoint Rust chose', async () => {
    const cmds: string[] = [];
    const res = await launchOcrService({
      invokeFn: async (cmd) => { cmds.push(cmd); return ready('http://127.0.0.1:50111/v1'); }
    });
    assert.deepEqual(cmds, ['start_ocr_service']);
    assert.equal(res.success, true);
    assert.equal(res.endpoint, 'http://127.0.0.1:50111/v1');
  });

  it('launchOcrService waits while the spawned service initializes', async () => {
    let polls = 0;
    const res = await launchOcrService({
      timeoutMs: 1000,
      retryIntervalMs: 15,
      invokeFn: async (cmd) => {
        if (cmd === 'start_ocr_service') return { mode: 'owned', state: 'starting' };
        return ++polls >= 2 ? ready() : { mode: 'owned', state: 'starting' };
      }
    });
    assert.equal(res.success, true);
  });

  it('launchOcrService returns a graceful error when native start and status both fail', async () => {
    const res = await launchOcrService({
      timeoutMs: 50,
      retryIntervalMs: 15,
      invokeFn: async (cmd) => {
        if (cmd === 'start_ocr_service') throw new Error('OCR backend not found');
        return { mode: 'off', state: 'off' };
      }
    });
    assert.equal(res.success, false);
    assert.match(res.message, /Failed to start OCR service: OCR backend not found/);
  });

  it('launchOcrService does not treat an unconfirmed external server as started', async () => {
    const res = await launchOcrService({
      invokeFn: async () => ({ mode: 'external-unconfirmed', state: 'needs-confirmation', endpoint: 'http://127.0.0.1:9001/v1', message: 'confirm first' })
    });
    assert.equal(res.success, false);
    assert.equal(res.endpoint, 'http://127.0.0.1:9001/v1');
  });

  it('configureExternalOcr passes the exact endpoint and confirmation to Rust', async () => {
    let seen: { cmd: string; args?: Record<string, unknown> } | null = null;
    await configureExternalOcr('http://127.0.0.1:9001/v1', true, async (cmd, args) => { seen = { cmd, args }; return { mode: 'external', state: 'ready' }; });
    assert.deepEqual(seen, { cmd: 'ocr_configure_external', args: { endpoint: 'http://127.0.0.1:9001/v1', confirm: true } });
  });

  it('parseImageBlobWithOcr sends documents only through the ocr_request command, never fetch', async () => {
    const realFetch = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = (async () => { fetched++; throw new Error('network must not be used'); }) as typeof fetch;
    try {
      let seen: Record<string, unknown> | undefined;
      const out = await parseImageBlobWithOcr(new Blob(['x'], { type: 'image/png' }), {
        invokeFn: async (cmd, args) => {
          assert.equal(cmd, 'ocr_request');
          seen = args;
          return { status: 200, body: JSON.stringify({ choices: [{ message: { content: '# Title\n\ntext' } }] }) };
        }
      });
      assert.deepEqual(out.headings, ['Title']);
      assert.equal(seen?.method, 'POST');
      assert.equal(seen?.path, 'chat/completions');
      assert.equal(fetched, 0);
      await assert.rejects(
        parseImageBlobWithOcr(new Blob(['x']), { invokeFn: async () => ({ status: 500, body: 'bad' }) }),
        /failed \(500\)/
      );
      await assert.rejects(
        parseImageBlobWithOcr(new Blob(['x']), { invokeFn: async () => { throw new Error('OCR service is not running'); } }),
        /not running/
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('the client source has no direct network access or hard-coded loopback ports', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/workspace/ocr-client.ts', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\bfetch\s*\(/.test(code), 'no fetch()');
    assert.ok(!/XMLHttpRequest|WebSocket|EventSource/.test(code));
    assert.ok(!/:(8000|3900)\b/.test(code), 'no fixed OCR ports');
  });
});
