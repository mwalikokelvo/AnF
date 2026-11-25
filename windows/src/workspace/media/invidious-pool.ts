export interface InvidiousInstanceStats {
  uri: string;
  latencyMs: number;
  failures: number;
}

export class InvidiousInstancePool {
  private readonly instances = new Map<string, InvidiousInstanceStats>();

  constructor(uris: string[]) {
    for (const uri of uris) {
      this.instances.set(uri, { uri, latencyMs: Number.POSITIVE_INFINITY, failures: 0 });
    }
  }

  recordSuccess(uri: string, latencyMs: number): void {
    const prev = this.instances.get(uri) ?? { uri, latencyMs, failures: 0 };
    prev.latencyMs = latencyMs;
    prev.failures = 0;
    this.instances.set(uri, prev);
  }

  recordFailure(uri: string): void {
    const prev = this.instances.get(uri) ?? { uri, latencyMs: Number.POSITIVE_INFINITY, failures: 0 };
    prev.failures += 1;
    this.instances.set(uri, prev);
  }

  private ranked(): InvidiousInstanceStats[] {
    return Array.from(this.instances.values()).sort((a, b) => {
      if (a.failures !== b.failures) return a.failures - b.failures;
      return a.latencyMs - b.latencyMs;
    });
  }

  getBestInstance(): InvidiousInstanceStats {
    const ordered = this.ranked();
    if (ordered.length === 0) {
      throw new Error('No Invidious instances configured');
    }
    return ordered[0];
  }

  async executeWithFailover<T>(fn: (baseUri: string) => Promise<T>): Promise<T> {
    const ordered = this.ranked();
    let lastErr: unknown;
    for (const inst of ordered) {
      try {
        const result = await fn(inst.uri);
        this.recordSuccess(inst.uri, inst.latencyMs === Number.POSITIVE_INFINITY ? 0 : inst.latencyMs);
        return result;
      } catch (err) {
        this.recordFailure(inst.uri);
        lastErr = err;
      }
    }
    throw lastErr ?? new Error('All Invidious instances failed');
  }
}
