import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VectorSearchCore } from '../src/workspace/storage/vector-search';

describe('Frontier 1: Dense Vector Search & Hybrid RRF', () => {
  it('generates normalized 128-d vectors and computes high similarity for semantically related text', () => {
    const v1 = VectorSearchCore.embedText('local-first offline private storage architecture');
    const v2 = VectorSearchCore.embedText('local offline private database and storage');
    const vUnrelated = VectorSearchCore.embedText('cooking pasta with tomato basil sauce');

    assert.equal(v1.length, 128);
    const simRelated = VectorSearchCore.cosineSimilarity(v1, v2);
    const simUnrelated = VectorSearchCore.cosineSimilarity(v1, vUnrelated);

    assert.ok(simRelated > 0.45, `Expected related similarity > 0.45, got ${simRelated}`);
    assert.ok(simUnrelated < 0.15, `Expected unrelated similarity < 0.15, got ${simUnrelated}`);
  });

  it('fuses lexical BM25 and vector rankings with reciprocal rank fusion', () => {
    const bm25 = [{ id: 'docA', score: 12.5 }, { id: 'docB', score: 9.1 }];
    const vector = [{ id: 'docB', score: 0.88 }, { id: 'docC', score: 0.85 }];

    const fused = VectorSearchCore.fuseRankings(bm25, vector);
    assert.equal(fused.length, 3);
    // docB appeared in both lists (#2 in BM25, #1 in Vector), so its RRF score is highest
    assert.equal(fused[0].id, 'docB');
    assert.ok(fused[0].rrfScore > fused[1].rrfScore);
  });
});
