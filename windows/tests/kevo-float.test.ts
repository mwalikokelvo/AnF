/**
 * Browser-fixture test for Kevo float micro-pill window (H.2).
 * Verifies that each `kevo://state` value gives the right `data-state`,
 * and that nothing runs between events (no timers pending after any event in this step).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createKevoFloat, type KevoHudState, type KevoStateEvent } from '../src/kevo-float/float.js';

type MockNode = {
  tag: string;
  className: string;
  style: Record<string, string>;
  children: MockNode[];
  parent: MockNode | null;
  attrs: Record<string, string>;
  append: (...nodes: unknown[]) => void;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  remove: () => void;
};

function setupMockDom() {
  const create = (tag: string): MockNode => {
    const el: MockNode = {
      tag,
      className: '',
      style: {},
      children: [],
      parent: null,
      attrs: {},
      append(...nodes) {
        for (const node of nodes) {
          if (!node || typeof node !== 'object') continue;
          const child = node as MockNode;
          child.parent = el;
          el.children.push(child);
        }
      },
      setAttribute(name, value) {
        el.attrs[name] = value;
        if (name === 'class') el.className = value;
      },
      getAttribute(name) {
        return el.attrs[name] ?? null;
      },
      remove() {
        if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el);
      },
    };
    return el;
  };

  const document = {
    createElement(tag: string) {
      return create(tag) as unknown as HTMLElement;
    },
    getElementById(_id: string) {
      return create('div') as unknown as HTMLElement;
    },
  };

  (globalThis as unknown as { document: typeof document }).document = document;
  return { create };
}

describe('Kevo float micro-pill (H.2)', () => {
  beforeEach(() => {
    setupMockDom();
  });

  afterEach(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it('initializes with state=off, drag region attribute, and dot/pulse children', () => {
    const root = document.createElement('div');
    const float = createKevoFloat(root);

    assert.equal(float.getState(), 'off');
    assert.equal(float.pill.getAttribute('data-state'), 'off');
    assert.equal(float.pill.getAttribute('data-tauri-drag-region'), 'true');
    assert.ok(float.dot);
    assert.ok(float.pulse);
  });

  it('updates data-state for each kevo://state value with no pending timers', () => {
    const root = document.createElement('div');
    const float = createKevoFloat(root);

    let timerCalls = 0;
    let intervalCalls = 0;
    let rafCalls = 0;
    const origSetTimeout = globalThis.setTimeout;
    const origSetInterval = globalThis.setInterval;
    const origRaf = (globalThis as unknown as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame;

    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      timerCalls++;
      return origSetTimeout(fn, ms, ...args);
    }) as typeof setTimeout;

    globalThis.setInterval = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      intervalCalls++;
      return origSetInterval(fn, ms, ...args);
    }) as typeof setInterval;

    (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame = () => {
      rafCalls++;
      return 1;
    };

    try {
      const states: KevoHudState[] = ['off', 'idle', 'listening', 'thinking', 'speaking', 'alert', 'sleeping'];

      for (const state of states) {
        const event: KevoStateEvent = {
          state,
          line: `Current step: ${state}`,
          badge: 'Local model',
          level: state === 'speaking' ? 0.75 : 0.0,
        };

        float.applyState(event);

        // Verify the right data-state on the pill element and root
        assert.equal(float.pill.getAttribute('data-state'), state, `pill data-state matches ${state}`);
        assert.equal(float.root.getAttribute('data-state'), state, `root data-state matches ${state}`);
        assert.equal(float.getState(), state);

        // Verify rule 4: no timers or polling scheduled between events
        assert.equal(timerCalls, 0, `no setTimeout called for state ${state}`);
        assert.equal(intervalCalls, 0, `no setInterval called for state ${state}`);
        assert.equal(rafCalls, 0, `no requestAnimationFrame called for state ${state}`);
      }
    } finally {
      globalThis.setTimeout = origSetTimeout;
      globalThis.setInterval = origSetInterval;
      if (origRaf) {
        (globalThis as unknown as { requestAnimationFrame: typeof origRaf }).requestAnimationFrame = origRaf;
      } else {
        delete (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame;
      }
    }
  });

  it('drives the pulse only while speaking and resets on other states', () => {
    const root = document.createElement('div');
    const float = createKevoFloat(root);

    let timerCalls = 0;
    const origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      timerCalls++;
      return origSetTimeout(fn, ms, ...args);
    }) as typeof setTimeout;

    try {
      // When speaking with level 0.8
      float.applyState({
        state: 'speaking',
        line: 'Speaking...',
        badge: '',
        level: 0.8,
      });

      assert.equal(float.pill.getAttribute('data-state'), 'speaking');
      assert.ok((float.pulse.style.background || '').includes('163, 229, 205'));
      assert.ok((float.pulse.style.transform || '').includes('scale'));
      assert.equal(float.pulse.style.opacity, '0.8');

      // Transitions to idle -> pulse resets
      float.applyState({
        state: 'idle',
        line: '',
        badge: '',
        level: 0.0,
      });

      assert.equal(float.pill.getAttribute('data-state'), 'idle');
      assert.equal(float.pulse.style.background, 'transparent');
      assert.equal(float.pulse.style.transform, '');
      assert.equal(float.pulse.style.opacity, '0');

      // Confirm no timers were started during speech level pulses
      assert.equal(timerCalls, 0);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });
});
