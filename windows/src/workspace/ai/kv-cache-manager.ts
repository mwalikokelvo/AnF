/**
 * Rolling KV-Cache Eviction & Attention Sink Manager
 * 
 * Implements StreamingLLM attention sinks and Heavy-Hitter (H2O) cache eviction
 * for local inference on memory-constrained devices, allowing infinite-length
 * book interactions without running out of RAM.
 * 
 * Inspired by magnitudedev/magnitude dynamic memory and kernel adaptation.
 */

export interface CacheEntry {
  tokenIndex: number;
  tokenId: number;
  attentionScore: number;
  isSink: boolean;
  isHeavyHitter: boolean;
}

export interface KvCacheConfig {
  maxCacheTokens: number;   // Maximum total tokens retained in KV cache (e.g. 512)
  sinkTokens: number;       // Number of initial anchor tokens to always retain (e.g. 4)
  heavyHitterTokens: number;// Number of high-attention tokens to retain outside the window (e.g. 32)
  bytesPerToken: number;    // Approx byte size per key-value layer token (default: 4096 bytes)
}

export interface EvictionReport {
  totalTokensSeen: number;
  retainedTokens: number;
  evictedTokens: number;
  evictionRatio: number;
  memorySavedMb: number;
  currentCacheSizeMb: number;
}

export class KvCacheManager {
  private config: KvCacheConfig;
  private entries: Map<number, CacheEntry> = new Map();
  private totalSeen = 0;

  constructor(config: Partial<KvCacheConfig> = {}) {
    this.config = {
      maxCacheTokens: config.maxCacheTokens ?? 256,
      sinkTokens: config.sinkTokens ?? 4,
      heavyHitterTokens: config.heavyHitterTokens ?? 16,
      bytesPerToken: config.bytesPerToken ?? 4096
    };
  }

  /**
   * Appends incoming tokens with attention scores into the active cache
   */
  public pushTokens(tokens: Array<{ id: number; attentionScore?: number }>): void {
    for (const t of tokens) {
      const idx = this.totalSeen++;
      const isSink = idx < this.config.sinkTokens;
      this.entries.set(idx, {
        tokenIndex: idx,
        tokenId: t.id,
        attentionScore: t.attentionScore || 1.0,
        isSink,
        isHeavyHitter: false
      });
    }

    this.evictIfNeeded();
  }

  /**
   * Enforces attention-sink and heavy-hitter eviction policy
   */
  public evictIfNeeded(): void {
    if (this.entries.size <= this.config.maxCacheTokens) return;

    const allEntries = Array.from(this.entries.values());

    // 1. Separate sink tokens (first S tokens)
    const sinks = allEntries.filter(e => e.isSink);

    // 2. Separate recent rolling window tokens (last W tokens)
    const rollingWindowBudget = this.config.maxCacheTokens - this.config.sinkTokens - this.config.heavyHitterTokens;
    const windowStart = Math.max(0, this.totalSeen - rollingWindowBudget);
    const windowEntries = allEntries.filter(e => !e.isSink && e.tokenIndex >= windowStart);

    // 3. Middle candidates: pick top Heavy-Hitters by attention score
    const middleCandidates = allEntries.filter(e => !e.isSink && e.tokenIndex < windowStart);
    middleCandidates.sort((a, b) => b.attentionScore - a.attentionScore);

    const heavyHitters = middleCandidates.slice(0, this.config.heavyHitterTokens);
    for (const hh of heavyHitters) {
      hh.isHeavyHitter = true;
    }

    // Keep sinks + heavy hitters + rolling window
    const keepIndices = new Set<number>();
    for (const s of sinks) keepIndices.add(s.tokenIndex);
    for (const hh of heavyHitters) keepIndices.add(hh.tokenIndex);
    for (const w of windowEntries) keepIndices.add(w.tokenIndex);

    // Prune evicted
    for (const idx of this.entries.keys()) {
      if (!keepIndices.has(idx)) {
        this.entries.delete(idx);
      }
    }
  }

  /**
   * Generates memory and eviction efficiency report
   */
  public getReport(): EvictionReport {
    const retained = this.entries.size;
    const evicted = Math.max(0, this.totalSeen - retained);
    const evictionRatio = this.totalSeen > 0 ? Math.round((evicted / this.totalSeen) * 100) / 100 : 0;
    const memorySavedMb = Math.round(((evicted * this.config.bytesPerToken) / (1024 * 1024)) * 100) / 100;
    const currentCacheSizeMb = Math.round(((retained * this.config.bytesPerToken) / (1024 * 1024)) * 100) / 100;

    return {
      totalTokensSeen: this.totalSeen,
      retainedTokens: retained,
      evictedTokens: evicted,
      evictionRatio,
      memorySavedMb,
      currentCacheSizeMb
    };
  }

  public getRetainedTokenIndices(): number[] {
    return Array.from(this.entries.keys()).sort((a, b) => a - b);
  }

  public clear(): void {
    this.entries.clear();
    this.totalSeen = 0;
  }
}
