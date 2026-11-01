/**
 * 4-Tier Offline-First Storage Hierarchy & Deterministic Mutation Queue
 * Zero-telemetry guarantees across Windows and Android.
 */

export enum StorageTier {
  Vault = 'vault',          // Tier 1: Encrypted SQLCipher (atomic, FTS5 indexed)
  IndexedDb = 'indexeddb',  // Tier 2: Local structured cache & audio track blobs
  Filesystem = 'filesystem',// Tier 3: Exported files, backups, and ZIM archives
  Session = 'session',      // Tier 4: In-memory scratchpad and ephemeral playback state
}

export interface StorageTierPolicy {
  tier: StorageTier;
  encrypted: boolean;
  maxSizeBytes: number;
  persistence: 'permanent' | 'persistent' | 'ephemeral';
  description: string;
}

export const STORAGE_POLICIES: Record<StorageTier, StorageTierPolicy> = {
  [StorageTier.Vault]: {
    tier: StorageTier.Vault,
    encrypted: true,
    maxSizeBytes: 500 * 1024 * 1024, // 500 MB
    persistence: 'permanent',
    description: 'Encrypted SQLCipher database storing notes, project revisions, and FTS5 search index.',
  },
  [StorageTier.IndexedDb]: {
    tier: StorageTier.IndexedDb,
    encrypted: false,
    maxSizeBytes: 2 * 1024 * 1024 * 1024, // 2 GB
    persistence: 'persistent',
    description: 'Local IndexedDB for cached streaming audio tracks, LRCLIB lyrics, and podcast enclosures.',
  },
  [StorageTier.Filesystem]: {
    tier: StorageTier.Filesystem,
    encrypted: false,
    maxSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    persistence: 'permanent',
    description: 'Local filesystem for exported WAV/HTML files, ZIM archives, and encrypted backups.',
  },
  [StorageTier.Session]: {
    tier: StorageTier.Session,
    encrypted: false,
    maxSizeBytes: 16 * 1024 * 1024, // 16 MB
    persistence: 'ephemeral',
    description: 'SessionStorage / in-memory cache for live scratchpad, VU meter buffers, and undo stacks.',
  },
};

export interface OfflineMutation<T = unknown> {
  id: string;
  op: string;
  payload: T;
  tier: StorageTier;
  timestamp: number;
  attempts: number;
}

/**
 * Deterministic offline mutation queue with idempotent deduplication and replay capability
 */
export class OfflineMutationQueue {
  private queue: OfflineMutation[] = [];

  constructor(initialMutations: OfflineMutation[] = []) {
    for (const m of initialMutations) {
      this.enqueue(m);
    }
  }

  /**
   * Enqueues an offline mutation idempotently by id
   */
  enqueue<T>(mutation: Omit<OfflineMutation<T>, 'attempts' | 'timestamp'>): boolean {
    if (this.queue.some(m => m.id === mutation.id)) {
      return false; // Idempotent rejection of duplicate mutation
    }
    this.queue.push({
      ...mutation,
      timestamp: Date.now(),
      attempts: 0,
    });
    return true;
  }

  size(): number {
    return this.queue.length;
  }

  peek(): OfflineMutation | undefined {
    return this.queue[0];
  }

  dequeue(id: string): boolean {
    const idx = this.queue.findIndex(m => m.id === id);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  all(): OfflineMutation[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
  }

  /**
   * Replays pending mutations through the provided handler
   */
  async replay(
    handler: (mutation: OfflineMutation) => Promise<boolean>
  ): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;
    const pending = [...this.queue];

    for (const mutation of pending) {
      mutation.attempts++;
      try {
        const ok = await handler(mutation);
        if (ok) {
          this.dequeue(mutation.id);
          processed++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    return { processed, failed };
  }
}
