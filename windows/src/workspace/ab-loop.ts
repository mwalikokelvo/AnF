/**
 * Interactive A-B Loop Engine for precision audio repetition,
 * language learning, transcription, and musical rehearsal.
 */

export interface AbLoopState {
  enabled: boolean;
  pointA: number | null; // start in seconds
  pointB: number | null; // end in seconds
  loopCount: number;
}

export function formatTimeSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export class AbLoopEngine {
  private state: AbLoopState = {
    enabled: false,
    pointA: null,
    pointB: null,
    loopCount: 0,
  };

  private listeners = new Set<(state: AbLoopState) => void>();

  getState(): AbLoopState {
    return { ...this.state };
  }

  subscribe(fn: (state: AbLoopState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const copy = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(copy);
      } catch {}
    }
  }

  setPointA(currentTime: number): void {
    const time = Math.max(0, currentTime);
    this.state.pointA = time;
    // If B is already set and B <= A, reset B
    if (this.state.pointB !== null && this.state.pointB <= time) {
      this.state.pointB = null;
      this.state.enabled = false;
    } else if (this.state.pointB !== null) {
      this.state.enabled = true;
    }
    this.state.loopCount = 0;
    this.emit();
  }

  setPointB(currentTime: number): void {
    const time = Math.max(0, currentTime);
    if (this.state.pointA === null) {
      this.state.pointA = 0;
    }
    if (time <= this.state.pointA) {
      return; // B must be strictly after A
    }
    this.state.pointB = time;
    this.state.enabled = true;
    this.state.loopCount = 0;
    this.emit();
  }

  toggle(): void {
    if (this.state.pointA !== null && this.state.pointB !== null) {
      this.state.enabled = !this.state.enabled;
      this.emit();
    }
  }

  clear(): void {
    this.state.pointA = null;
    this.state.pointB = null;
    this.state.enabled = false;
    this.state.loopCount = 0;
    this.emit();
  }

  /**
   * Called on audio timeupdate. Returns target seek time if loop boundary reached, or null.
   */
  checkLoop(currentTime: number): number | null {
    if (!this.state.enabled || this.state.pointA === null || this.state.pointB === null) {
      return null;
    }

    if (currentTime >= this.state.pointB) {
      this.state.loopCount++;
      this.emit();
      return this.state.pointA;
    }

    return null;
  }

  formatStatus(): string {
    const { pointA, pointB, enabled, loopCount } = this.state;
    if (pointA === null && pointB === null) {
      return 'A-B Loop: Off';
    }
    if (pointA !== null && pointB === null) {
      return `A: ${formatTimeSeconds(pointA)} · Set B`;
    }
    if (pointA !== null && pointB !== null) {
      return `${enabled ? '🔁' : '⏸'} [${formatTimeSeconds(pointA)} – ${formatTimeSeconds(pointB)}]${
        loopCount > 0 ? ` (${loopCount}x)` : ''
      }`;
    }
    return 'A-B Loop: Off';
  }
}
