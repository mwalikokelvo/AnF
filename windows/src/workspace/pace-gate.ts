/**
 * Request pacing and 429 adaptive backoff gate.
 * Inspired by the Orion / communitybuilds GitlabPace architecture:
 * Prevents rapid burst flooding against public APIs (Audius, Invidious, LRCLIB),
 * enforces minimum spacing between requests to the same domain/node, and
 * establishes an adaptive cooldown period when HTTP 429 (Too Many Requests)
 * or 503 (Service Unavailable) is received.
 */

export class PaceGate {
  private lastRequestTime = new Map<string, number>();
  private cooldownUntil = new Map<string, number>();

  /**
   * Checks whether a domain or service key is currently in backoff cooldown.
   */
  isCoolingDown(key: string, now = Date.now()): boolean {
    const until = this.cooldownUntil.get(key);
    if (!until) return false;
    if (now >= until) {
      this.cooldownUntil.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Returns remaining cooldown milliseconds, or 0 if not cooling down.
   */
  getCooldownRemaining(key: string, now = Date.now()): number {
    const until = this.cooldownUntil.get(key);
    if (!until) return 0;
    const remaining = until - now;
    if (remaining <= 0) {
      this.cooldownUntil.delete(key);
      return 0;
    }
    return remaining;
  }

  /**
   * Triggers an adaptive cooldown period for a domain/node following HTTP 429 or 503.
   */
  triggerCooldown(key: string, durationMs = 30000, now = Date.now()): void {
    this.cooldownUntil.set(key, now + durationMs);
  }

  /**
   * Waits if necessary to ensure at least `minSpacingMs` has elapsed since the last
   * request to this domain or node. If the key is currently cooling down from a 429,
   * throws an Error immediately so the caller can fail over without stalling.
   */
  async acquire(
    key: string,
    minSpacingMs = 250,
    nowFn = Date.now,
    sleepFn = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  ): Promise<void> {
    const now = nowFn();
    if (this.isCoolingDown(key, now)) {
      const remaining = this.getCooldownRemaining(key, now);
      throw new Error(`Rate limit cooldown active for ${key} (${Math.ceil(remaining / 1000)}s remaining)`);
    }

    const last = this.lastRequestTime.get(key) || 0;
    const elapsed = now - last;
    if (elapsed < minSpacingMs && last > 0) {
      const delay = minSpacingMs - elapsed;
      await sleepFn(delay);
    }
    this.lastRequestTime.set(key, nowFn());
  }

  /**
   * Resets all pacing and cooldown records (for testing or manual cache bust).
   */
  reset(): void {
    this.lastRequestTime.clear();
    this.cooldownUntil.clear();
  }
}

/** Global pace gate for external music lookups. */
export const globalPaceGate = new PaceGate();
