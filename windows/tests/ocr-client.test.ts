import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractHeadings, extractDocumentMetadata, isOcrAvailable, DEFAULT_OCR_ENDPOINT } from '../src/workspace/ocr-client';

describe('Unlimited-OCR Client & Markdown Document Extractor', () => {
  it('extractHeadings correctly pulls markdown titles, sections, and sub-headings', () => {
    const md = `
# Executive Summary
Some opening remarks.
## Methodological Framework
Details on the method.
### Mathematical Model
Equations here.
## Evaluation and Results
Numbers and graphs.
    `;
    const headings = extractHeadings(md);
    assert.deepEqual(headings, [
      'Executive Summary',
      'Methodological Framework',
      'Mathematical Model',
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
});
