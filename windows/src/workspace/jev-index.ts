/**
 * Jev-Ultrafast & Agent-Reach: Compact Indexing & Cross-Vault Search Engine
 *
 * Implements high-performance client-side BM25 search with compact token-efficient
 * serialization and bounded context extraction. Enables sub-millisecond retrieval
 * across notes, podcast transcripts, lyrics, and knowledge archives without
 * external dependencies.
 */

export type SearchCorpus = 'notes' | 'transcripts' | 'lyrics' | 'articles' | 'tasks';

export interface IndexedDocument {
  id: string;
  corpus: SearchCorpus;
  title: string;
  content: string;
  updatedAt?: string;
  metadata?: Record<string, string>;
}

export interface SearchResult {
  docId: string;
  corpus: SearchCorpus;
  title: string;
  score: number;
  snippet: string;
  metadata?: Record<string, string>;
}

interface Posting {
  docId: string;
  tf: number;
}

export class JevIndex {
  private docs: Map<string, { id: string; corpus: SearchCorpus; title: string; length: number; content: string; metadata?: Record<string, string> }> = new Map();
  private postings: Map<string, Posting[]> = new Map();
  private totalLength = 0;

  // BM25 tuning constants
  private readonly k1 = 1.2;
  private readonly b = 0.75;

  /**
   * Tokenizes text into lowercase normalized terms, stripping punctuation.
   */
  public tokenize(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^\p{L}\p{N}_\s-]/gu, ' ') // keep letters, numbers, hyphens
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w));
  }

  /**
   * Adds or updates a document in the inverted index.
   */
  public addDocument(doc: IndexedDocument): void {
    if (this.docs.has(doc.id)) {
      this.removeDocument(doc.id);
    }

    const tokens = this.tokenize(`${doc.title} ${doc.content}`);
    const termFreqs: Map<string, number> = new Map();

    for (const t of tokens) {
      termFreqs.set(t, (termFreqs.get(t) || 0) + 1);
    }

    const length = tokens.length;
    this.docs.set(doc.id, {
      id: doc.id,
      corpus: doc.corpus,
      title: doc.title,
      length,
      content: doc.content,
      metadata: doc.metadata,
    });
    this.totalLength += length;

    for (const [term, tf] of termFreqs.entries()) {
      let list = this.postings.get(term);
      if (!list) {
        list = [];
        this.postings.set(term, list);
      }
      list.push({ docId: doc.id, tf });
    }
  }

  /**
   * Removes a document from the index.
   */
  public removeDocument(docId: string): void {
    const existing = this.docs.get(docId);
    if (!existing) return;

    this.totalLength -= existing.length;
    this.docs.delete(docId);

    for (const [term, list] of this.postings.entries()) {
      const filtered = list.filter(p => p.docId !== docId);
      if (filtered.length === 0) {
        this.postings.delete(term);
      } else {
        this.postings.set(term, filtered);
      }
    }
  }

  /**
   * Executes BM25 ranked search across indexed documents.
   */
  public search(query: string, options?: { corpus?: SearchCorpus; limit?: number }): SearchResult[] {
    const terms = this.tokenize(query);
    if (terms.length === 0 || this.docs.size === 0) return [];

    const limit = options?.limit ?? 10;
    const targetCorpus = options?.corpus;
    const nDocs = this.docs.size;
    const avgdl = this.totalLength / (nDocs || 1);

    const scores: Map<string, number> = new Map();

    for (const term of terms) {
      const postingsList = this.postings.get(term);
      if (!postingsList) continue;

      const df = postingsList.length;
      // BM25 standard IDF with smoothing
      const idf = Math.log(1 + (nDocs - df + 0.5) / (df + 0.5));

      for (const posting of postingsList) {
        const doc = this.docs.get(posting.docId);
        if (!doc) continue;
        if (targetCorpus && doc.corpus !== targetCorpus) continue;

        const tf = posting.tf;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (doc.length / avgdl));
        const termScore = idf * (numerator / denominator);

        scores.set(doc.id, (scores.get(doc.id) || 0) + termScore);
      }
    }

    const sortedDocIds = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return sortedDocIds.map(([docId, score]) => {
      const doc = this.docs.get(docId)!;
      return {
        docId: doc.id,
        corpus: doc.corpus,
        title: doc.title,
        score: Math.round(score * 100) / 100,
        snippet: this.generateSnippet(doc.content, terms),
        metadata: doc.metadata,
      };
    });
  }

  /**
   * Generates a compact, bounded context snippet with matched terms highlighted.
   */
  private generateSnippet(content: string, queryTerms: string[], maxChars = 140): string {
    if (!content) return '';
    const lower = content.toLowerCase();

    // Find the first matching query term position (or query term prefix/stem)
    let firstPos = -1;
    for (const t of queryTerms) {
      const p = lower.indexOf(t);
      if (p !== -1 && (firstPos === -1 || p < firstPos)) {
        firstPos = p;
      } else if (t.length >= 4) {
        const prefix = t.slice(0, 4);
        const pp = lower.indexOf(prefix);
        if (pp !== -1 && (firstPos === -1 || pp < firstPos)) {
          firstPos = pp;
        }
      }
    }

    if (firstPos === -1) {
      return content.slice(0, maxChars).trim() + (content.length > maxChars ? '…' : '');
    }

    const start = Math.max(0, firstPos - 30);
    const end = Math.min(content.length, start + maxChars);
    let snippet = content.slice(start, end).trim();

    if (start > 0) snippet = '…' + snippet;
    if (end < content.length) snippet = snippet + '…';

    return snippet;
  }

  /**
   * Serializes index into compact token-efficient JSON.
   */
  public serialize(): string {
    const rawDocs = Array.from(this.docs.values()).map(d => [d.id, d.corpus, d.title, d.length, d.content, d.metadata]);
    const rawPostings = Array.from(this.postings.entries()).map(([k, v]) => [k, v.map(p => [p.docId, p.tf])]);

    return JSON.stringify({
      v: 1,
      totalLength: this.totalLength,
      docs: rawDocs,
      postings: rawPostings,
    });
  }

  /**
   * Reconstitutes an index from serialized JSON string.
   */
  public static deserialize(json: string): JevIndex {
    const data = JSON.parse(json);
    const index = new JevIndex();
    index.totalLength = data.totalLength || 0;

    if (Array.isArray(data.docs)) {
      for (const [id, corpus, title, length, content, metadata] of data.docs) {
        index.docs.set(id, { id, corpus, title, length, content, metadata });
      }
    }

    if (Array.isArray(data.postings)) {
      for (const [term, list] of data.postings) {
        index.postings.set(
          term,
          list.map(([docId, tf]: [string, number]) => ({ docId, tf }))
        );
      }
    }

    return index;
  }

  public get documentCount(): number {
    return this.docs.size;
  }

  public get termCount(): number {
    return this.postings.size;
  }
}

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as',
  'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'could',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours',
]);
