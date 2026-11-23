/**
 * Lazy view registry for heavy workspace views (Settings, Audio Studio, Kevo desk).
 *
 * Safe lazy mounting rule: Views are constructed only on their first open, then
 * kept mounted in the DOM (`display: none` via `hidden` attribute). Inactive
 * views are NEVER unmounted because:
 * - Music Hub keeps playback and dock alive.
 * - Writing holds unsaved CodeMirror state.
 * - Audio Studio may be recording or processing.
 */

export interface ViewBuildMetric {
  id: string;
  durationMs: number;
  timestamp: number;
}

export interface LazyViewRegistry {
  register(id: string, builder: (panel: HTMLElement) => void): void;
  build(id: string, panel: HTMLElement): boolean;
  isBuilt(id: string): boolean;
  has(id: string): boolean;
  getBuildMetrics(): ViewBuildMetric[];
}

export function createLazyViewRegistry(): LazyViewRegistry {
  const builders = new Map<string, (panel: HTMLElement) => void>();
  const built = new Set<string>();
  const metrics: ViewBuildMetric[] = [];

  return {
    register(id: string, builder: (panel: HTMLElement) => void) {
      builders.set(id, builder);
    },
    build(id: string, panel: HTMLElement): boolean {
      if (built.has(id)) return false;
      const builder = builders.get(id);
      if (!builder) return false;
      built.add(id);
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
      builder(panel);
      const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
      metrics.push({ id, durationMs, timestamp: Date.now() });
      try {
        if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
          performance.mark(`anf-view-built-${id}`);
        }
      } catch {}
      return true;
    },
    isBuilt(id: string): boolean {
      return built.has(id);
    },
    has(id: string): boolean {
      return builders.has(id);
    },
    getBuildMetrics(): ViewBuildMetric[] {
      return [...metrics];
    },
  };
}
