/**
 * Dense Vector Embeddings & Hybrid RRF Search for AnF & ThingsBook
 * 
 * Provides ultra-lightweight on-device text vectorization, cosine similarity,
 * and Reciprocal Rank Fusion (RRF) combining lexical BM25 and dense semantic search.
 * Inspired by jingyaogong/minimind + magnitudedev/magnitude.
 */

export const VECTOR_DIMENSION = 128;

export interface RankedDocument {
  id: string;
  score: number;
}

export interface HybridSearchResult {
  id: string;
  rrfScore: number;
  bm25Rank?: number;
  vectorRank?: number;
}

export const VectorSearchCore = {
  /**
   * Fast 32-bit FNV-1a hash for string token.
   */
  fnv1a(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  },

  /**
   * Project text into a normalized 128-dimensional dense semantic embedding.
   */
  embedText(text: string, dimension = VECTOR_DIMENSION): Float32Array {
    const vec = new Float32Array(dimension);
    if (!text || typeof text !== 'string') return vec;

    const words = text.toLowerCase().match(/[\w']+/g) || [];
    if (words.length === 0) return vec;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      // 1. Unigram projection
      const h1 = VectorSearchCore.fnv1a(word);
      const idx1 = h1 % dimension;
      const sign1 = (h1 & 0x80000000) ? -1.0 : 1.0;
      vec[idx1] += sign1 * 1.0;

      // 2. Character n-gram subword projections (for morphological similarity)
      if (word.length >= 4) {
        for (let j = 0; j <= word.length - 3; j++) {
          const gram = word.slice(j, j + 3);
          const hg = VectorSearchCore.fnv1a(gram);
          const idxg = hg % dimension;
          const signg = (hg & 0x80000000) ? -0.5 : 0.5;
          vec[idxg] += signg;
        }
      }

      // 3. Bigram context projection
      if (i > 0) {
        const bigram = `${words[i - 1]}_${word}`;
        const h2 = VectorSearchCore.fnv1a(bigram);
        const idx2 = h2 % dimension;
        const sign2 = (h2 & 0x80000000) ? -1.5 : 1.5;
        vec[idx2] += sign2;
      }
    }

    // L2 Normalize
    let normSq = 0;
    for (let i = 0; i < dimension; i++) {
      normSq += vec[i] * vec[i];
    }

    const norm = Math.sqrt(normSq);
    if (norm > 0) {
      for (let i = 0; i < dimension; i++) {
        vec[i] /= norm;
      }
    }

    return vec;
  },

  /**
   * Compute cosine similarity between two normalized float vectors [-1.0 to 1.0].
   */
  cosineSimilarity(vecA: Float32Array, vecB: Float32Array): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
    }
    return Number(Math.max(-1.0, Math.min(1.0, dot)).toFixed(5));
  },

  /**
   * Reciprocal Rank Fusion (RRF) combining BM25 keyword rankings with Vector rankings.
   */
  fuseRankings(
    bm25List: RankedDocument[],
    vectorList: RankedDocument[],
    k = 60
  ): HybridSearchResult[] {
    const scores = new Map<string, { rrf: number; bm25Rank?: number; vectorRank?: number }>();

    for (let r = 0; r < bm25List.length; r++) {
      const doc = bm25List[r];
      const rank = r + 1;
      const current = scores.get(doc.id) || { rrf: 0 };
      current.rrf += 1 / (k + rank);
      current.bm25Rank = rank;
      scores.set(doc.id, current);
    }

    for (let r = 0; r < vectorList.length; r++) {
      const doc = vectorList[r];
      const rank = r + 1;
      const current = scores.get(doc.id) || { rrf: 0 };
      current.rrf += 1 / (k + rank);
      current.vectorRank = rank;
      scores.set(doc.id, current);
    }

    const merged: HybridSearchResult[] = [];
    for (const [id, data] of scores.entries()) {
      merged.push({
        id,
        rrfScore: Number(data.rrf.toFixed(6)),
        bm25Rank: data.bm25Rank,
        vectorRank: data.vectorRank,
      });
    }

    // Sort descending by RRF score
    return merged.sort((a, b) => b.rrfScore - a.rrfScore);
  }
};
