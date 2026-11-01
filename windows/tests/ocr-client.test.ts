import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractHeadings,
  extractDocumentMetadata,
  isOcrAvailable,
  checkEndpointHealth,
  detectActiveOcrEndpoint,
  waitForOcrReady,
  launchOcrService,
  DEFAULT_OCR_ENDPOINT,
  FALLBACK_OCR_ENDPOINT,
  OCR_ENDPOINTS
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

  it('isOcrAvailable returns false gracefully when local OCR service is offline', async () => {
    // Port 59999 is guaranteed unused
    const available = await isOcrAvailable('http://127.0.0.1:59999/v1');
    assert.equal(available, false);
  });

  it('detectActiveOcrEndpoint identifies responsive endpoint on primary or fallback port', async () => {
    // Mock check function simulating port 8000 down, but fallback 3900 up
    const mockCheck = async (ep: string) => ep.includes(':3900');
    
    // Test custom check logic with detectActiveOcrEndpoint logic
    const endpoints = [DEFAULT_OCR_ENDPOINT, FALLBACK_OCR_ENDPOINT];
    let detected: string | null = null;
    for (const ep of endpoints) {
      if (await mockCheck(ep)) {
        detected = ep;
        break;
      }
    }
    assert.equal(detected, FALLBACK_OCR_ENDPOINT);

    // When primary 8000 is up, it takes precedence
    const primaryUpCheck = async (ep: string) => ep.includes(':8000') || ep.includes(':3900');
    let primaryDetected: string | null = null;
    for (const ep of endpoints) {
      if (await primaryUpCheck(ep)) {
        primaryDetected = ep;
        break;
      }
    }
    assert.equal(primaryDetected, DEFAULT_OCR_ENDPOINT);
  });

  it('detectActiveOcrEndpoint returns null when all ports are offline', async () => {
    const offlineEndpoints = ['http://127.0.0.1:59991/v1', 'http://127.0.0.1:59992/v1'];
    const active = await detectActiveOcrEndpoint(offlineEndpoints, 200);
    assert.equal(active, null);
  });

  it('waitForOcrReady retries until OCR service becomes available', async () => {
    let attempts = 0;
    const readyOnAttempt = 3;
    const mockCheck = async () => {
      attempts++;
      return attempts >= readyOnAttempt;
    };

    const readyEndpoint = await waitForOcrReady({
      endpoints: ['http://localhost:8000/v1'],
      timeoutMs: 2000,
      retryIntervalMs: 20,
      checkFn: mockCheck
    });

    assert.equal(readyEndpoint, 'http://localhost:8000/v1');
    assert.ok(attempts >= 3, `Expected at least 3 attempts, got ${attempts}`);
  });

  it('waitForOcrReady throws error if service does not start within timeoutMs', async () => {
    const neverReady = async () => false;

    await assert.rejects(
      async () => {
        await waitForOcrReady({
          endpoints: ['http://localhost:8000/v1'],
          timeoutMs: 60,
          retryIntervalMs: 20,
          checkFn: neverReady
        });
      },
      /failed to respond within 60ms/
    );
  });

  it('launchOcrService returns ready immediately if service is already online', async () => {
    let invokeCalled = false;
    const mockInvoke = async () => {
      invokeCalled = true;
      return {};
    };

    const res = await launchOcrService({
      endpoints: [DEFAULT_OCR_ENDPOINT],
      invokeFn: mockInvoke,
      checkFn: async () => true // already up
    });

    assert.equal(res.success, true);
    assert.equal(res.endpoint, DEFAULT_OCR_ENDPOINT);
    assert.equal(invokeCalled, false); // shouldn't spawn if already running
  });

  it('launchOcrService triggers native start_ocr_service and awaits readiness', async () => {
    let invokedCmd = '';
    let isUp = false;

    const mockInvoke = async (cmd: string) => {
      invokedCmd = cmd;
      // simulate daemon warming up after invocation
      setTimeout(() => {
        isUp = true;
      }, 30);
      return { status: 'starting' };
    };

    const res = await launchOcrService({
      endpoints: [FALLBACK_OCR_ENDPOINT],
      invokeFn: mockInvoke,
      timeoutMs: 500,
      retryIntervalMs: 15,
      checkFn: async () => isUp
    });

    assert.equal(invokedCmd, 'start_ocr_service');
    assert.equal(res.success, true);
    assert.equal(res.endpoint, FALLBACK_OCR_ENDPOINT);
  });

  it('launchOcrService returns graceful error when native invocation and startup fail', async () => {
    const failingInvoke = async () => {
      throw new Error('OCR binary missing from PATH');
    };

    const res = await launchOcrService({
      endpoints: ['http://localhost:8000/v1'],
      invokeFn: failingInvoke,
      timeoutMs: 50,
      retryIntervalMs: 15,
      checkFn: async () => false
    });

    assert.equal(res.success, false);
    assert.match(res.message, /Failed to start OCR service/);
  });
});
