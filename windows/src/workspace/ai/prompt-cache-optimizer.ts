/**
 * Prompt Cache Breakpoint Optimizer
 * 
 * Analyzes prompt payloads, tool schemas, and multi-turn message history
 * to insert optimal ephemeral cache breakpoints, reducing API latency and
 * slashing input token costs by up to 90% via provider prompt caching.
 * 
 * Inspired by Twigpine/openclaude prompt caching architecture.
 */

export interface CacheableBlock {
  type: 'system' | 'tools' | 'document' | 'message';
  content: string;
  estimatedTokens: number;
  cacheControl?: { type: 'ephemeral' };
}

export interface OptimizedPayload {
  blocks: CacheableBlock[];
  totalTokens: number;
  cachedTokens: number;
  cacheHitRatio: number;
  estimatedSavingsUsd: number;
}

export class PromptCacheOptimizer {
  private minCacheableTokens: number;
  private maxBreakpoints: number;

  constructor(options: { minCacheableTokens?: number; maxBreakpoints?: number } = {}) {
    this.minCacheableTokens = options.minCacheableTokens ?? 1024;
    this.maxBreakpoints = options.maxBreakpoints ?? 4;
  }

  public estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
  }

  /**
   * Optimizes prompt blocks by attaching ephemeral cache breakpoints to large, static prefixes
   */
  public optimizePrompt(blocks: Array<{ type: CacheableBlock['type']; content: string }>): OptimizedPayload {
    const scoredBlocks: CacheableBlock[] = blocks.map(b => ({
      type: b.type,
      content: b.content,
      estimatedTokens: this.estimateTokens(b.content)
    }));

    // Prioritize static prefix blocks: 'system' and 'document' / 'tools'
    let assignedBreakpoints = 0;
    let cachedTokens = 0;
    let totalTokens = 0;

    for (const b of scoredBlocks) {
      totalTokens += b.estimatedTokens;
      const isStaticType = b.type === 'system' || b.type === 'tools' || b.type === 'document';

      if (isStaticType && b.estimatedTokens >= this.minCacheableTokens && assignedBreakpoints < this.maxBreakpoints) {
        b.cacheControl = { type: 'ephemeral' };
        assignedBreakpoints++;
        cachedTokens += b.estimatedTokens;
      }
    }

    const hitRatio = totalTokens > 0 ? Math.round((cachedTokens / totalTokens) * 100) / 100 : 0;
    // Standard Claude 3.5 Sonnet: $3.00/M base prompt -> $0.30/M cached prompt ($2.70 saved per 1M cached tokens)
    const savings = Math.round((cachedTokens / 1000000) * 2.70 * 10000) / 10000;

    return {
      blocks: scoredBlocks,
      totalTokens,
      cachedTokens,
      cacheHitRatio: hitRatio,
      estimatedSavingsUsd: savings
    };
  }
}
