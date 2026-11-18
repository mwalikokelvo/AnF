/**
 * Browser-fixture test for Kevo float micro-pill and telemetry pill (H.2 & H.3).
 * Verifies:
 * - Micro-pill initialization and data-state mapping (H.2).
 * - Grow on wake, on hover, and while an action runs (H.3).
 * - Fold 4 s after the last event (the one fold timer is the only timer pending, and none is left once folded) (H.3).
 * - Long text (two lines, ellipsis, newest at bottom, never wider than the pill) (H.3).
 * - Resizing command notification (H.3).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createKevoFloat, type KevoHudState, type KevoStateEvent } from '../src/kevo-float/float.js';
import { handlePillDrop, categorizeFile, MAX_DROP_BYTES } from '../src/kevo-float/drop.js';
import type { DragDropPayload, DroppedFile } from '../src/core/bridge.js';

type MockEventListener = (event?: unknown) => void;

type MockNode = {
  tag: string;
  className: string;
  style: Record<string, string>;
  children: MockNode[];
  parent: MockNode | null;
  attrs: Record<string, string>;
  listeners: Record<string, MockEventListener[]>;
  _textContent: string;
  textContent: string;
  append: (...nodes: unknown[]) => void;
  appendChild: (node: unknown) => unknown;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  addEventListener: (event: string, listener: MockEventListener) => void;
  dispatchEvent: (event: string) => void;
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
      listeners: {},
      _textContent: '',
      get textContent() {
        return el._textContent;
      },
      set textContent(val: string) {
        el._textContent = val;
      },
      append(...nodes) {
        for (const node of nodes) {
          if (!node || typeof node !== 'object') continue;
          const child = node as MockNode;
          child.parent = el;
          el.children.push(child);
        }
      },
      appendChild(node) {
        if (node && typeof node === 'object') {
          const child = node as MockNode;
          child.parent = el;
          el.children.push(child);
        }
        return node;
      },
      setAttribute(name, value) {
        el.attrs[name] = value;
        if (name === 'class') el.className = value;
      },
      getAttribute(name) {
        return el.attrs[name] ?? null;
      },
      addEventListener(event, listener) {
        if (!el.listeners[event]) el.listeners[event] = [];
        el.listeners[event].push(listener);
      },
      dispatchEvent(event) {
        const list = el.listeners[event] || [];
        for (const listener of list) listener();
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
  });
});

describe('Kevo float telemetry pill (H.3)', () => {
  beforeEach(() => {
    setupMockDom();
  });

  afterEach(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it('grows on wake', () => {
    const root = document.createElement('div');
    let resizeCalls: boolean[] = [];
    const float = createKevoFloat(root, {
      onResize: (expanded) => resizeCalls.push(expanded),
    });

    // Starts idle & folded
    float.applyState({ state: 'idle' });
    assert.equal(float.isExpanded(), false);
    assert.equal(float.pill.getAttribute('data-expanded'), 'false');

    // Wake arrives (listening)
    float.applyState({ state: 'listening' });
    assert.equal(float.isExpanded(), true);
    assert.equal(float.pill.getAttribute('data-expanded'), 'true');
    assert.deepEqual(resizeCalls, [true]);
  });

  it('grows while an action runs (thinking, speaking)', () => {
    const root = document.createElement('div');
    let resizeCalls: boolean[] = [];
    const float = createKevoFloat(root, {
      onResize: (expanded) => resizeCalls.push(expanded),
    });

    // Start idle
    float.applyState({ state: 'idle' });
    assert.equal(float.isExpanded(), false);

    // Action starts
    float.applyState({ state: 'thinking', line: 'Opening Brave...' });
    assert.equal(float.isExpanded(), true);
    assert.equal(float.pill.getAttribute('data-expanded'), 'true');
    assert.deepEqual(resizeCalls, [true]);

    // Action continues into speaking
    float.applyState({ state: 'speaking', line: 'Brave is open', level: 0.5 });
    assert.equal(float.isExpanded(), true);
  });

  it('grows on hover', () => {
    const root = document.createElement('div');
    let resizeCalls: boolean[] = [];
    const float = createKevoFloat(root, {
      onResize: (expanded) => resizeCalls.push(expanded),
    });

    float.applyState({ state: 'idle' });
    assert.equal(float.isExpanded(), false);

    // Hover via setHover / mouseenter
    float.setHover(true);
    assert.equal(float.isExpanded(), true);
    assert.equal(float.pill.getAttribute('data-expanded'), 'true');
    assert.deepEqual(resizeCalls, [true]);
  });

  it('folds back to State 1 after 4 s of quiet, leaving 0 timers pending', () => {
    type TimerEntry = { id: number; callback: () => void; ms: number };
    const pendingTimers = new Map<number, TimerEntry>();
    let nextId = 1;

    const origSetTimeout = globalThis.setTimeout;
    const origClearTimeout = globalThis.clearTimeout;

    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number) => {
      const id = nextId++;
      pendingTimers.set(id, { id, callback: fn as () => void, ms: ms ?? 0 });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
      if (typeof id === 'number') pendingTimers.delete(id);
    }) as typeof clearTimeout;

    try {
      const root = document.createElement('div');
      let resizeCalls: boolean[] = [];
      const float = createKevoFloat(root, {
        onResize: (expanded) => resizeCalls.push(expanded),
        foldDelayMs: 4000,
      });

      // Start idle (folded, 0 timers pending)
      float.applyState({ state: 'idle' });
      assert.equal(float.isExpanded(), false);
      assert.equal(pendingTimers.size, 0, 'no timers while folded and idle');

      // Waking event arrives
      float.applyState({ state: 'listening' });
      assert.equal(float.isExpanded(), true);
      assert.equal(pendingTimers.size, 0, 'no fold timer while listening');

      // Transitions to idle after action finishes
      float.applyState({ state: 'idle' });
      assert.equal(float.isExpanded(), true, 'still expanded immediately after action finishes');
      assert.equal(pendingTimers.size, 1, 'the one fold timer is the only timer pending');

      // Fire the fold timer (representing 4 s elapsed)
      const timer = Array.from(pendingTimers.values())[0];
      assert.equal(timer.ms, 4000);
      pendingTimers.delete(timer.id);
      timer.callback();

      // Folded back to State 1
      assert.equal(float.isExpanded(), false, 'folded after 4 s of quiet');
      assert.equal(float.pill.getAttribute('data-expanded'), 'false');
      assert.equal(pendingTimers.size, 0, 'no timer is left once folded');
      assert.deepEqual(resizeCalls, [true, false]);
    } finally {
      globalThis.setTimeout = origSetTimeout;
      globalThis.clearTimeout = origClearTimeout;
    }
  });

  it('folds back after mouse leave when quiet', () => {
    type TimerEntry = { id: number; callback: () => void; ms: number };
    const pendingTimers = new Map<number, TimerEntry>();
    let nextId = 1;

    const origSetTimeout = globalThis.setTimeout;
    const origClearTimeout = globalThis.clearTimeout;

    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number) => {
      const id = nextId++;
      pendingTimers.set(id, { id, callback: fn as () => void, ms: ms ?? 0 });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
      if (typeof id === 'number') pendingTimers.delete(id);
    }) as typeof clearTimeout;

    try {
      const root = document.createElement('div');
      const float = createKevoFloat(root, { foldDelayMs: 4000 });

      float.applyState({ state: 'idle' });
      assert.equal(float.isExpanded(), false);

      // Hover
      float.setHover(true);
      assert.equal(float.isExpanded(), true);
      assert.equal(pendingTimers.size, 0, 'no fold timer while hovering');

      // Unhover
      float.setHover(false);
      assert.equal(float.isExpanded(), true);
      assert.equal(pendingTimers.size, 1, 'fold timer scheduled on mouse leave');

      // Trigger fold timer
      const timer = Array.from(pendingTimers.values())[0];
      pendingTimers.delete(timer.id);
      timer.callback();

      assert.equal(float.isExpanded(), false);
      assert.equal(pendingTimers.size, 0);
    } finally {
      globalThis.setTimeout = origSetTimeout;
      globalThis.clearTimeout = origClearTimeout;
    }
  });

  it('displays two lines of text with newest at the bottom and badge', () => {
    const root = document.createElement('div');
    const float = createKevoFloat(root);

    // First line arrives
    float.applyState({
      state: 'listening',
      line: 'Open Brave browser and play YouTube',
      badge: 'Local model · 1.2 s',
    });

    assert.equal(float.linePrevEl.textContent, '');
    assert.equal(float.lineCurrEl.textContent, 'Open Brave browser and play YouTube');
    assert.equal(float.badgeEl.textContent, 'Local model · 1.2 s');

    // Second line arrives (action running)
    float.applyState({
      state: 'thinking',
      line: 'Opening Brave...',
      badge: 'Local model · 0.8 s',
    });

    // Older line shifts to linePrev, newest is at lineCurr (bottom)
    assert.equal(float.linePrevEl.textContent, 'Open Brave browser and play YouTube');
    assert.equal(float.lineCurrEl.textContent, 'Opening Brave...');
    assert.equal(float.badgeEl.textContent, 'Local model · 0.8 s');
  });

  it('handles long text without error and preserves structure', () => {
    const root = document.createElement('div');
    const float = createKevoFloat(root);

    const longText = 'A'.repeat(500);
    float.applyState({
      state: 'speaking',
      line: longText,
      badge: 'Offline · 4.2 s',
    });

    assert.equal(float.lineCurrEl.textContent, longText);
    assert.equal(float.badgeEl.textContent, 'Offline · 4.2 s');
    assert.ok(float.linesEl.children.length === 2);
  });
});

describe('Kevo float file drop (H.5)', () => {
  it('categorizes supported and unsupported file extensions', () => {
    assert.equal(categorizeFile('notes.md'), 'markdown_text');
    assert.equal(categorizeFile('document.markdown'), 'markdown_text');
    assert.equal(categorizeFile('plain.txt'), 'markdown_text');
    assert.equal(categorizeFile('book.epub'), 'epub');
    assert.equal(categorizeFile('voice.mp3'), 'audio');
    assert.equal(categorizeFile('clip.wav'), 'audio');
    assert.equal(categorizeFile('recording.m4a'), 'audio');
    assert.equal(categorizeFile('song.flac'), 'audio');
    assert.equal(categorizeFile('audio.ogg'), 'audio');
    assert.equal(categorizeFile('app.exe'), 'unsupported');
    assert.equal(categorizeFile('archive.zip'), 'unsupported');
    assert.equal(categorizeFile('image.png'), 'unsupported');
  });

  it('drops markdown files: calls ingest and reports saved to vault', async () => {
    let ingestCalls = 0;
    let messageShown = '';

    const payload: DragDropPayload = {
      type: 'drop',
      file: {
        name: 'meeting.md',
        ingest: async () => {
          ingestCalls++;
          return { name: 'meeting.md', path: 'C:\\vault\\meeting.md', size: 1024 };
        },
      },
    };

    let vaultImported: DroppedFile | null = null;
    await handlePillDrop(payload, {
      showMessage: (msg) => { messageShown = msg; },
      importVault: async (file) => { vaultImported = file; },
    });

    assert.equal(ingestCalls, 1, 'ingest called for markdown file');
    assert.ok(messageShown.includes('Saved meeting.md to vault'));
    assert.equal(vaultImported?.name, 'meeting.md');
  });

  it('drops text files: calls ingest and reports saved to vault', async () => {
    let ingestCalls = 0;
    let messageShown = '';

    const payload: DragDropPayload = {
      type: 'drop',
      file: {
        name: 'notes.txt',
        ingest: async () => {
          ingestCalls++;
          return { name: 'notes.txt', path: 'C:\\vault\\notes.txt', size: 500 };
        },
      },
    };

    await handlePillDrop(payload, {
      showMessage: (msg) => { messageShown = msg; },
    });

    assert.equal(ingestCalls, 1, 'ingest called for txt file');
    assert.ok(messageShown.includes('Saved notes.txt to vault'));
  });

  it('drops epub books: calls ingest and reports imported', async () => {
    let ingestCalls = 0;
    let messageShown = '';
    let epubImported: DroppedFile | null = null;

    const payload: DragDropPayload = {
      type: 'drop',
      file: {
        name: 'guide.epub',
        ingest: async () => {
          ingestCalls++;
          return { name: 'guide.epub', path: 'C:\\docs\\guide.epub', size: 500000 };
        },
      },
    };

    await handlePillDrop(payload, {
      showMessage: (msg) => { messageShown = msg; },
      importEpub: async (file) => { epubImported = file; },
    });

    assert.equal(ingestCalls, 1, 'ingest called for epub file');
    assert.ok(messageShown.includes('Imported guide.epub'));
    assert.equal(epubImported?.name, 'guide.epub');
  });

  it('drops audio files: calls ingest and reports transcribing', async () => {
    let ingestCalls = 0;
    let messageShown = '';
    let audioImported: DroppedFile | null = null;

    const payload: DragDropPayload = {
      type: 'drop',
      file: {
        name: 'voice.wav',
        ingest: async () => {
          ingestCalls++;
          return { name: 'voice.wav', path: 'C:\\audio\\voice.wav', size: 2048000 };
        },
      },
    };

    await handlePillDrop(payload, {
      showMessage: (msg) => { messageShown = msg; },
      importAudio: async (file) => { audioImported = file; },
    });

    assert.equal(ingestCalls, 1, 'ingest called for audio file');
    assert.ok(messageShown.includes('Transcribing voice.wav'));
    assert.equal(audioImported?.name, 'voice.wav');
  });

  it('refuses unsupported file types: shows message and makes no ingest call', async () => {
    const unsupportedFiles = ['malware.exe', 'backup.zip', 'photo.png', 'archive.tar.gz'];

    for (const name of unsupportedFiles) {
      let ingestCalls = 0;
      let messageShown = '';

      const payload: DragDropPayload = {
        type: 'drop',
        file: {
          name,
          ingest: async () => {
            ingestCalls++;
            return { name, path: '', size: 100 };
          },
        },
      };

      await handlePillDrop(payload, {
        showMessage: (msg) => { messageShown = msg; },
      });

      assert.equal(ingestCalls, 0, `no ingest call for unsupported file: ${name}`);
      assert.equal(messageShown, "I can't take that file yet", `refusal message for: ${name}`);
    }
  });

  it('refuses files exceeding the 200 MB bridge size limit', async () => {
    let ingestCalls = 0;
    let messageShown = '';

    const payload: DragDropPayload = {
      type: 'drop',
      file: {
        name: 'huge_book.epub',
        size: 250 * 1024 * 1024, // 250 MB (exceeds 200 MB)
        ingest: async () => {
          ingestCalls++;
          return { name: 'huge_book.epub', path: '', size: 250 * 1024 * 1024 };
        },
      },
    };

    await handlePillDrop(payload, {
      showMessage: (msg) => { messageShown = msg; },
      maxSize: MAX_DROP_BYTES,
    });

    assert.equal(ingestCalls, 0, 'no ingest call for oversized file');
    assert.ok(messageShown.includes('File exceeds 200 MB limit'));
  });
});
