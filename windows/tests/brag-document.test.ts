import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  categorizeBragText,
  buildBragDocument,
  type BragDocumentInput,
} from '../src/workspace/brag-document.js';

describe('Latent-Spaces Brag Document Generator', () => {
  test('categorizeBragText accurately partitions accomplishments', () => {
    assert.equal(categorizeBragText('Unit test coverage for DSP engine'), 'Quality');
    assert.equal(categorizeBragText('Regression gate verification check'), 'Quality');
    assert.equal(categorizeBragText('RFC 5545 iCalendar task stream export'), 'Standard');
    assert.equal(categorizeBragText('Podcasting 2.0 namespace XML specification'), 'Standard');
    assert.equal(categorizeBragText('Web Audio DSP GainNode parameter automation pipeline'), 'Architecture');
    assert.equal(categorizeBragText('Decouple database adapter and cache layer'), 'Architecture');
    assert.equal(categorizeBragText('Interactive Kanban board with drag-and-drop cards'), 'Feature');
    assert.equal(categorizeBragText('Substack article publishing editor'), 'Feature');
  });

  test('buildBragDocument generates complete Markdown document with frontmatter and metrics', () => {
    const input: BragDocumentInput = {
      title: 'Q4 Core Platform Accomplishments',
      period: '2026-Q4',
      author: 'Antigravity AI Pair Programmer',
      completedTasks: [
        { text: 'Interactive Kanban board with List View toggle', source: 'Dashboard Notes' },
        { text: 'Sample-accurate Web Audio GainNode crossfades', category: 'Architecture', source: 'Audio DSP' },
        { text: 'RFC 5545 iCalendar task export for Cal.com', source: 'Sprint Log' },
        { text: 'Automated 11/11 release regression checks', source: 'CI Pipeline' },
      ],
      inProgressTasks: [
        { text: 'Cross-device WebRTC p2p local sync', source: 'Roadmap' },
      ],
      architecturalMilestones: [
        'Eliminated duplicate file maintenance by introducing single-source-of-truth re-exports',
        'Zero external npm dependencies added; 100% native platform Web APIs utilized',
      ],
      qualityMetrics: {
        unitTestsPassing: 401,
        testSuites: 56,
        e2eTestsPassing: 138,
        regressionGatesPassing: 11,
        bundleBuildTime: '6.92s',
      },
      keyLearnings: [
        'Ponytail senior dev rule: Shortest working diff is always superior to elaborate wrappers',
      ],
    };

    const doc = buildBragDocument(input);

    assert.ok(doc.startsWith('---'));
    assert.ok(doc.includes('title: "Q4 Core Platform Accomplishments"'));
    assert.ok(doc.includes('type: brag-document'));
    assert.ok(doc.includes('completed_items: 4'));
    assert.ok(doc.includes('tags:\n  - brag\n  - accomplishments'));
    assert.ok(doc.includes('# Q4 Core Platform Accomplishments'));
    assert.ok(doc.includes('## Shipped Features & User Capabilities (1)'));
    assert.ok(doc.includes('## Architectural & Core Engine Improvements (1)'));
    assert.ok(doc.includes('## Open Standards & Data Portability (1)'));
    assert.ok(doc.includes('## Quality, Testing & Reliability (1)'));
    assert.ok(doc.includes('401 unit tests passing (56 suites)'));
    assert.ok(doc.includes('## Major Architectural Milestones'));
    assert.ok(doc.includes('## In-Flight / Next Focus Items (1)'));
    assert.ok(doc.includes('## Key Engineering Insights'));
  });

  test('buildBragDocument handles minimal input without crashing', () => {
    const doc = buildBragDocument({ completedTasks: [] });
    assert.ok(doc.startsWith('---'));
    assert.ok(doc.includes('completed_items: 0'));
    assert.ok(doc.includes('# Engineering Accomplishments'));
  });
});
