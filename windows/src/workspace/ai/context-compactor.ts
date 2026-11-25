/**
 * Context Auto-Compactor & Entity-Preserving Rolling Summarizer
 * 
 * Provides rolling context window management, automated conversation compaction,
 * and entity preservation for long-horizon AI sessions without losing user constraints.
 * 
 * Inspired by Twigpine/openclaude context compaction mechanisms.
 */

export interface CompactableMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface CompactionResult {
  compactedMessages: CompactableMessage[];
  originalCount: number;
  compactedCount: number;
  extractedEntities: string[];
  compressionRatio: number;
}

export interface CompactorOptions {
  maxRecentTurns?: number;     // Number of recent turns to preserve verbatim (default: 4)
  targetTokenLimit?: number;   // Target token budget (approx characters / 4)
}

export class ContextCompactor {
  private maxRecentTurns: number;
  private targetTokenLimit: number;

  constructor(options: CompactorOptions = {}) {
    this.maxRecentTurns = options.maxRecentTurns ?? 4;
    this.targetTokenLimit = options.targetTokenLimit ?? 1500;
  }

  /**
   * Estimates token count (fast approximation: 1 token ~= 4 chars)
   */
  public estimateTokens(messages: CompactableMessage[]): number {
    let chars = 0;
    for (const m of messages) {
      chars += (m.content || '').length;
    }
    return Math.ceil(chars / 4);
  }

  /**
   * Extracts essential named entities, user directives, constraints, and facts
   */
  public extractEntitiesAndDirectives(messages: CompactableMessage[]): string[] {
    const findings: Set<string> = new Set();

    for (const m of messages) {
      const text = m.content;

      // Extract explicit user instructions & constraints
      const directMatches = text.match(/(?:must|never|always|prefer|remember that|my name is|working on|objective is)\s+[^.!?\n]+/gi);
      if (directMatches) {
        for (const match of directMatches) {
          findings.add(match.trim());
        }
      }

      // Extract capitalized multi-word proper nouns / entity candidates (e.g. "ThingsBook", "OpenMAIC")
      const entityMatches = text.match(/\b[A-Z][a-zA-Z0-9_]+(?:\s+[A-Z][a-zA-Z0-9_]+)*\b/g);
      if (entityMatches) {
        for (const ent of entityMatches) {
          if (ent.length > 3 && !['What', 'When', 'Where', 'Which', 'This', 'That', 'There', 'Here', 'User', 'Assistant'].includes(ent)) {
            findings.add(ent);
          }
        }
      }
    }

    return Array.from(findings);
  }

  /**
   * Compacts conversation history if it exceeds the target token limit or length threshold
   */
  public compact(messages: CompactableMessage[]): CompactionResult {
    const originalCount = messages.length;
    const estTokens = this.estimateTokens(messages);

    // If already compact, return unchanged
    if (messages.length <= (this.maxRecentTurns + 1) && estTokens <= this.targetTokenLimit) {
      return {
        compactedMessages: [...messages],
        originalCount,
        compactedCount: originalCount,
        extractedEntities: [],
        compressionRatio: 1.0
      };
    }

    const splitIdx = Math.max(0, messages.length - this.maxRecentTurns);
    const staleHistory = messages.slice(0, splitIdx);
    const recentHistory = messages.slice(splitIdx);

    // Extract core memory entities & key constraints
    const entities = this.extractEntitiesAndDirectives(staleHistory);

    // Synthesize condensed summary of stale history
    const summaryPoints: string[] = [];
    for (let i = 0; i < staleHistory.length; i += 2) {
      const userMsg = staleHistory[i];
      const assistMsg = staleHistory[i + 1];
      if (userMsg && userMsg.role === 'user') {
        const querySnippet = userMsg.content.slice(0, 80).replace(/\n/g, ' ');
        const replySnippet = assistMsg ? assistMsg.content.slice(0, 100).replace(/\n/g, ' ') : '';
        summaryPoints.push(`- Goal: "${querySnippet}" -> Settled: "${replySnippet}..."`);
      }
    }

    const memoryBlock: CompactableMessage = {
      role: 'system',
      content: `[Context Compaction Memory]\n` +
        `Preserved Entities & Directives:\n` +
        (entities.length > 0 ? entities.map(e => `* ${e}`).join('\n') : `* None specified`) + `\n\n` +
        `Summary of Previous Turns:\n` +
        (summaryPoints.length > 0 ? summaryPoints.join('\n') : `- Earlier discussion compacted.`)
    };

    const compactedMessages: CompactableMessage[] = [memoryBlock, ...recentHistory];
    const newTokens = this.estimateTokens(compactedMessages);
    const ratio = estTokens > 0 ? Math.round((newTokens / estTokens) * 100) / 100 : 1.0;

    return {
      compactedMessages,
      originalCount,
      compactedCount: compactedMessages.length,
      extractedEntities: entities,
      compressionRatio: ratio
    };
  }
}
