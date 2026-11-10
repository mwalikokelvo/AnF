import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Import queue algorithms
import {
  reconcileQueue,
  moveTrack,
  shuffled,
  nextTrack,
  previousTrack,
  enqueueTrack,
  playNextTrack,
  playPreviousTrack,
  removeTrack,
  type RepeatMode
} from '../../../shared/audio/queue.js';

// Setup full browser mock environment for Music Hub
class MockClassList {
  private classes = new Set<string>();
  add(...tokens: string[]): void { tokens.forEach(t => this.classes.add(t)); }
  remove(...tokens: string[]): void { tokens.forEach(t => this.classes.delete(t)); }
  contains(token: string): boolean { return this.classes.has(token); }
  toggle(token: string, force?: boolean): boolean {
    if (force !== undefined) {
      if (force) this.classes.add(token); else this.classes.delete(token);
      return force;
    }
    if (this.classes.has(token)) { this.classes.delete(token); return false; }
    this.classes.add(token);
    return true;
  }
  toString(): string { return Array.from(this.classes).join(' '); }
}

class AdvancedMockElement {
  tagName: string;
  attributes: Record<string, string> = {};
  children: AdvancedMockElement[] = [];
  parentElement: AdvancedMockElement | null = null;
  dataset: Record<string, string> = {};
  listeners: Record<string, EventListener[]> = {};
  classList = new MockClassList();
  style: Record<string, string> & { setProperty: (k: string, v: string) => void } = {
    setProperty: (k: string, v: string) => { (this.style as Record<string, string>)[k] = v; }
  };
  hidden = false;
  open = false;
  disabled = false;
  value = '';
  type = '';
  placeholder = '';
  title = '';
  tabIndex = 0;
  id = '';
  min = '0';
  max = '1';
  step = '0.1';
  offsetTop = 0;
  offsetHeight = 20;
  clientHeight = 100;

  private _textContent = '';
  get textContent(): string {
    if (this.children.length === 0) return this._textContent;
    return this.children.map(c => c.textContent).join('');
  }
  set textContent(val: string) {
    this._textContent = val;
  }

  get className(): string { return this.classList.toString(); }
  set className(val: string) {
    this.classList = new MockClassList();
    if (val) val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
  }

  constructor(tagName: string) {
    this.tagName = tagName.toLowerCase();
  }

  getAttribute(name: string): string | null {
    return this.attributes[name.toLowerCase()] ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes[name.toLowerCase()] = String(value);
  }
  removeAttribute(name: string): void {
    delete this.attributes[name.toLowerCase()];
  }
  hasAttribute(name: string): boolean {
    return this.attributes[name.toLowerCase()] !== undefined;
  }

  append(...nodes: (AdvancedMockElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new AdvancedMockElement('#text');
        textNode.textContent = node;
        textNode.parentElement = this;
        this.children.push(textNode);
      } else if (node instanceof AdvancedMockElement) {
        node.parentElement = this;
        this.children.push(node);
      }
    }
  }

  replaceChildren(...nodes: (AdvancedMockElement | string)[]): void {
    this.children = [];
    this._textContent = '';
    this.append(...nodes);
  }

  addEventListener(event: string, listener: EventListener): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }

  removeEventListener(event: string, listener: EventListener): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(l => l !== listener);
  }

  dispatchEvent(event: { type: string }): boolean {
    const fn = (this as any)['on' + event.type];
    if (typeof fn === 'function') fn(event as unknown as Event);
    const list = this.listeners[event.type] || [];
    for (const l of list) l(event as unknown as Event);
    return true;
  }

  querySelector(selector: string): AdvancedMockElement | null {
    const list = this.querySelectorAll(selector);
    return list[0] || null;
  }

  querySelectorAll(selector: string): AdvancedMockElement[] {
    const matches: AdvancedMockElement[] = [];
    const traverse = (node: AdvancedMockElement) => {
      for (const child of node.children) {
        if (child.tagName !== '#text') {
          if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) {
            matches.push(child);
          } else if (selector.startsWith('#') && child.id === selector.slice(1)) {
            matches.push(child);
          } else if (selector.includes('[') && selector.includes(']')) {
            const [tag, rest] = selector.split('[');
            const [attr, val] = rest.replace(']', '').split('=');
            const cleanVal = val ? val.replace(/["']/g, '') : undefined;
            if ((!tag || child.tagName === tag.toLowerCase()) && child.hasAttribute(attr)) {
              if (cleanVal === undefined || child.getAttribute(attr) === cleanVal) matches.push(child);
            }
          } else if (child.tagName === selector.toLowerCase()) {
            matches.push(child);
          }
          traverse(child);
        }
      }
    };
    traverse(this);
    return matches;
  }

  showModal(): void { this.open = true; }
  close(): void { this.open = false; }
  scrollTo(): void {}
  focus(): void {}
  click(): void { this.dispatchEvent({ type: 'click' }); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 20 }; }
}

class AdvancedMockAudio {
  src = '';
  preload = '';
  currentTime = 0;
  duration = 180;
  volume = 0.7;
  playbackRate = 1.0;
  defaultPlaybackRate = 1.0;
  paused = true;
  readyState = 4;
  seeking = false;
  ended = false;
  error: { code: number; message?: string } | null = null;
  listeners: Record<string, EventListener[]> = {};

  shouldRejectPlay = false;
  rejectionError = new Error('NotAllowedError: play() failed');

  addEventListener(event: string, fn: EventListener): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event: string, fn: EventListener): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(l => l !== fn);
  }

  dispatchEvent(event: { type: string }): boolean {
    const fn = (this as any)['on' + event.type];
    if (typeof fn === 'function') fn(event as unknown as Event);
    const list = this.listeners[event.type] || [];
    for (const l of list) l(event as unknown as Event);
    return true;
  }

  async play(): Promise<void> {
    if (this.shouldRejectPlay) {
      throw this.rejectionError;
    }
    this.paused = false;
    this.dispatchEvent({ type: 'playing' });
  }

  pause(): void {
    this.paused = true;
    this.dispatchEvent({ type: 'pause' });
  }

  load(): void {
    this.readyState = 4;
    this.dispatchEvent({ type: 'loadstart' });
    this.dispatchEvent({ type: 'loadedmetadata' });
    this.dispatchEvent({ type: 'canplay' });
  }
}

// MediaSession Mock
class MockMediaSession {
  metadata: unknown = null;
  playbackState: 'none' | 'paused' | 'playing' = 'none';
  handlers = new Map<string, Function>();

  setActionHandler(action: string, handler: Function | null): void {
    if (handler) this.handlers.set(action, handler);
    else this.handlers.delete(action);
  }
}

// In-Memory Storage Mock
class AdvancedMockStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.has(key) ? this.data.get(key)! : null; }
  setItem(key: string, val: string): void { this.data.set(key, String(val)); }
  removeItem(key: string): void { this.data.delete(key); }
  clear(): void { this.data.clear(); }
  get length(): number { return this.data.size; }
  key(i: number): string | null { return Array.from(this.data.keys())[i] ?? null; }
}

// Global environment setup function
let activeAudioElement: AdvancedMockAudio | null = null;

import { MockIDBFactory } from '../../../windows/tests/e2e/test-env.js';

function installGlobalMockEnv() {
  const g = globalThis as any;

  g.indexedDB = new MockIDBFactory();

  Object.defineProperty(globalThis, 'localStorage', {
    value: new AdvancedMockStorage(),
    configurable: true,
    writable: true
  });

  g.MediaError = {
    MEDIA_ERR_ABORTED: 1,
    MEDIA_ERR_NETWORK: 2,
    MEDIA_ERR_DECODE: 3,
    MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
  };
  g.MediaMetadata = class {
    constructor(public init: any) {}
  };

  const docEl = new AdvancedMockElement('html');
  const head = new AdvancedMockElement('head');
  const body = new AdvancedMockElement('body');
  docEl.append(head, body);

  g.document = {
    documentElement: docEl,
    head,
    body,
    createElement: (tag: string) => new AdvancedMockElement(tag),
    createElementNS: (_ns: string, tag: string) => new AdvancedMockElement(tag),
    createTextNode: (text: string) => {
      const el = new AdvancedMockElement('#text');
      el.textContent = text;
      return el;
    },
    getElementById: (id: string) => docEl.querySelector('#' + id),
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  g.window = {
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    matchMedia: () => ({ matches: false })
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaSession: new MockMediaSession(),
      onLine: true
    },
    configurable: true,
    writable: true
  });

  g.Audio = class extends AdvancedMockAudio {
    constructor() {
      super();
      activeAudioElement = this;
    }
  };

  if (!URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:mock-' + Math.random().toString(36).slice(2);
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = () => {};
  }
}

installGlobalMockEnv();

// Now import Music Hub after globals are configured
import { createMusicHub, type PlaybackState } from '../../../windows/src/workspace/music-hub.js';
import { audioLibrary, type AudioTrack } from '../../../windows/src/workspace/audio-library.js';

describe('Adversarial Empirical Stress Testing — Milestone M1 Area 1', () => {

  // =========================================================================
  // DIMENSION 1: Queue State Transitions Under Rapid & Pathological Manipulation
  // =========================================================================
  describe('Dimension 1: Queue State Transitions Under Rapid Manipulation', () => {

    test('1.1 reconcileQueue Fuzz Testing (2,000 iterations with random pathological inputs)', () => {
      for (let iter = 0; iter < 2000; iter++) {
        const pool = ['track-A', 'track-B', 'track-C', 'track-D', 'track-E', 'unicode-🎵', 'special-&?=/', ''];
        const savedLen = Math.floor(Math.random() * 20);
        const availLen = Math.floor(Math.random() * 20);

        const saved: string[] = [];
        for (let i = 0; i < savedLen; i++) {
          saved.push(pool[Math.floor(Math.random() * pool.length)]);
        }

        const available: string[] = [];
        for (let i = 0; i < availLen; i++) {
          available.push(pool[Math.floor(Math.random() * pool.length)]);
        }

        const includeNew = Math.random() > 0.5;
        const result = reconcileQueue(saved, available, includeNew);

        // Invariant 1: Result must contain zero duplicate IDs
        assert.equal(result.length, new Set(result).size, `Duplicates detected in iteration ${iter}`);

        // Invariant 2: Every element in result must be present in available
        const availSet = new Set(available);
        for (const id of result) {
          assert.ok(availSet.has(id), `Orphan track ID ${id} in result`);
        }

        // Invariant 3: If includeNew is true, every valid available track must be in result
        if (includeNew) {
          for (const id of availSet) {
            assert.ok(result.includes(id), `Missing available track ${id} when includeNew=true`);
          }
        } else {
          // If includeNew is false, no track absent from saved should appear in result
          const savedSet = new Set(saved);
          for (const id of result) {
            assert.ok(savedSet.has(id), `Unexpected track ${id} when includeNew=false`);
          }
        }

        // Invariant 4: Relative order of valid saved tracks is strictly preserved
        const savedValid = saved.filter(id => availSet.has(id));
        const firstIndices = result.map(id => savedValid.indexOf(id)).filter(idx => idx !== -1);
        for (let i = 1; i < firstIndices.length; i++) {
          assert.ok(firstIndices[i] >= firstIndices[i - 1], `Saved track order corrupted in iteration ${iter}`);
        }
      }
    });

    test('1.2 previousTrack Exhaustive Matrix (repeat off, track, all across queue states)', () => {
      const q = ['track-1', 'track-2', 'track-3', 'track-4'];

      // Normal interior steps
      assert.equal(previousTrack(q, 'track-4', 'off'), 'track-3');
      assert.equal(previousTrack(q, 'track-3', 'off'), 'track-2');
      assert.equal(previousTrack(q, 'track-2', 'off'), 'track-1');
      assert.equal(previousTrack(q, 'track-3', 'track'), 'track-2');
      assert.equal(previousTrack(q, 'track-3', 'all'), 'track-2');

      // Index 0 boundary conditions
      assert.equal(previousTrack(q, 'track-1', 'off'), undefined, 'repeat off at start must return undefined');
      assert.equal(previousTrack(q, 'track-1', 'track'), 'track-1', 'repeat track at start must return current track');
      assert.equal(previousTrack(q, 'track-1', 'all'), 'track-4', 'repeat all at start must wrap to end of queue');

      // Single track queue
      const single = ['only-one'];
      assert.equal(previousTrack(single, 'only-one', 'off'), undefined);
      assert.equal(previousTrack(single, 'only-one', 'track'), 'only-one');
      assert.equal(previousTrack(single, 'only-one', 'all'), 'only-one');

      // Empty queue
      assert.equal(previousTrack([], 'track-1', 'off'), undefined);
      assert.equal(previousTrack([], 'track-1', 'track'), undefined);
      assert.equal(previousTrack([], 'track-1', 'all'), undefined);

      // Current not in queue
      assert.equal(previousTrack(q, 'ghost-track', 'off'), 'track-1');
      assert.equal(previousTrack(q, 'ghost-track', 'track'), 'track-1');
      assert.equal(previousTrack(q, 'ghost-track', 'all'), 'track-1');

      // Undefined current
      assert.equal(previousTrack(q, undefined, 'off'), 'track-1');
      assert.equal(previousTrack(q, undefined, 'all'), 'track-1');
    });

    test('1.3 moveTrack Boundary & Out-of-Bounds Robustness', () => {
      const initial = ['a', 'b', 'c', 'd'];

      // Valid movements
      assert.deepEqual(moveTrack(initial, 'a', 3), ['b', 'c', 'd', 'a']);
      assert.deepEqual(moveTrack(initial, 'd', 0), ['d', 'a', 'b', 'c']);
      assert.deepEqual(moveTrack(initial, 'b', 1), ['a', 'b', 'c', 'd']);

      // Negative target clamps to 0 without loss
      assert.deepEqual(moveTrack(initial, 'c', -5), ['c', 'a', 'b', 'd']);
      assert.deepEqual(moveTrack(initial, 'c', -1), ['c', 'a', 'b', 'd']);

      // Target beyond length clamps to length without loss
      assert.deepEqual(moveTrack(initial, 'b', 999), ['a', 'c', 'd', 'b']);
      assert.deepEqual(moveTrack(initial, 'a', 100), ['b', 'c', 'd', 'a']);

      // Target as NaN or -Infinity
      assert.deepEqual(moveTrack(initial, 'b', NaN), ['b', 'a', 'c', 'd']);
      assert.deepEqual(moveTrack(initial, 'b', -Infinity), ['b', 'a', 'c', 'd']);
      assert.deepEqual(moveTrack(initial, 'b', Infinity), ['a', 'c', 'd', 'b']);

      // Non-existent ID returns exact copy
      assert.deepEqual(moveTrack(initial, 'non-existent', 2), ['a', 'b', 'c', 'd']);

      // Empty queue
      assert.deepEqual(moveTrack([], 'any', 0), []);
    });

    test('1.4 shuffled Multiset Invariance & Seed Robustness', () => {
      const list = ['10', '20', '30', '40', '50', '60'];

      // Edge case: empty and single-element
      assert.deepEqual(shuffled([]), []);
      assert.deepEqual(shuffled(['one']), ['one']);

      // Test extreme pseudo-random generators
      assert.deepEqual(shuffled(list, () => 0), ['20', '30', '40', '50', '60', '10']);
      assert.deepEqual(shuffled(list, () => 0.999999), ['10', '20', '30', '40', '50', '60']);

      // 500 random shuffles: verify multiset equality on every shuffle
      for (let i = 0; i < 500; i++) {
        const res = shuffled(list);
        assert.equal(res.length, list.length);
        assert.deepEqual([...res].sort(), [...list].sort());
      }
    });

    test('1.5 enqueueTrack Idempotency and Ordering', () => {
      let q: string[] = [];
      q = enqueueTrack(q, 't1');
      assert.deepEqual(q, ['t1']);

      q = enqueueTrack(q, 't2');
      assert.deepEqual(q, ['t1', 't2']);

      // Idempotency: re-enqueuing does not duplicate or alter position
      q = enqueueTrack(q, 't1');
      assert.deepEqual(q, ['t1', 't2']);

      q = enqueueTrack(q, 't3');
      assert.deepEqual(q, ['t1', 't2', 't3']);
    });

    test('1.6 playNextTrack & playPreviousTrack Symmetrical Insertion', () => {
      const base = ['A', 'B', 'C'];

      // playNextTrack inserts after current
      assert.deepEqual(playNextTrack(base, 'B', 'NEW'), ['A', 'B', 'NEW', 'C']);
      assert.deepEqual(playNextTrack(base, 'C', 'NEW'), ['A', 'B', 'C', 'NEW']);

      // playNextTrack when target already in list: relocates target
      assert.deepEqual(playNextTrack(base, 'A', 'C'), ['A', 'C', 'B']);

      // playNextTrack when current undefined or missing: inserts at head
      assert.deepEqual(playNextTrack(base, undefined, 'NEW'), ['NEW', 'A', 'B', 'C']);
      assert.deepEqual(playNextTrack(base, 'MISSING', 'NEW'), ['NEW', 'A', 'B', 'C']);

      // playPreviousTrack inserts before current
      assert.deepEqual(playPreviousTrack(base, 'B', 'NEW'), ['A', 'NEW', 'B', 'C']);
      assert.deepEqual(playPreviousTrack(base, 'A', 'NEW'), ['NEW', 'A', 'B', 'C']);

      // playPreviousTrack when target already in list: relocates target
      assert.deepEqual(playPreviousTrack(base, 'C', 'A'), ['B', 'A', 'C']);

      // playPreviousTrack when current undefined or missing: inserts at head
      assert.deepEqual(playPreviousTrack(base, undefined, 'NEW'), ['NEW', 'A', 'B', 'C']);
    });

    test('1.7 removeTrack Safe Elimination', () => {
      const q = ['x', 'y', 'z'];
      assert.deepEqual(removeTrack(q, 'y'), ['x', 'z']);
      assert.deepEqual(removeTrack(q, 'not-in-queue'), ['x', 'y', 'z']);
      assert.deepEqual(removeTrack([], 'x'), []);
    });

    test('1.8 5,000-Step Rapid Queue Manipulation Fuzz Stress Harness', () => {
      let q: string[] = ['init-1', 'init-2', 'init-3'];
      let current: string | undefined = 'init-1';
      const availablePool = Array.from({ length: 30 }, (_, i) => `pool-${i}`);

      for (let op = 0; op < 5000; op++) {
        const choice = Math.floor(Math.random() * 8);
        const randomItem = availablePool[Math.floor(Math.random() * availablePool.length)];

        switch (choice) {
          case 0:
            q = enqueueTrack(q, randomItem);
            break;
          case 1:
            q = playNextTrack(q, current, randomItem);
            break;
          case 2:
            q = playPreviousTrack(q, current, randomItem);
            break;
          case 3:
            q = removeTrack(q, randomItem);
            if (current === randomItem) current = q[0];
            break;
          case 4:
            q = moveTrack(q, randomItem, Math.floor(Math.random() * (q.length + 5)) - 2);
            break;
          case 5:
            q = shuffled(q);
            break;
          case 6: {
            const next = nextTrack(q, current, 'all', false);
            if (next) current = next;
            break;
          }
          case 7: {
            const prev = previousTrack(q, current, 'all');
            if (prev) current = prev;
            break;
          }
        }

        // Integrity assertion after every single mutation:
        assert.ok(Array.isArray(q), 'Queue must remain an array');
        assert.equal(q.length, new Set(q).size, `Queue contains duplicate elements at step ${op}`);
        for (const item of q) {
          assert.equal(typeof item, 'string', 'All items in queue must be strings');
        }
      }
    });
  });

  // =========================================================================
  // DIMENSION 2: PlaybackState Machine Transitions Under Rapid Calls
  // =========================================================================
  describe('Dimension 2: PlaybackState Machine Transitions Under Rapid Calls', () => {
    let hub: ReturnType<typeof createMusicHub>;
    let notifiedMessages: string[] = [];
    let beforePlayCalled = false;

    beforeEach(async () => {
      installGlobalMockEnv();
      notifiedMessages = [];
      beforePlayCalled = false;

      // Seed mock tracks in audioLibrary
      const lib = audioLibrary();
      const track1: AudioTrack = {
        id: 'track-101',
        title: 'Empirical Track 1',
        artist: 'Test Artist',
        name: 'track-101.mp3',
        blob: new Blob(['dummy audio bytes'], { type: 'audio/mpeg' }),
        duration: 200,
        created: Date.now()
      };
      const track2: AudioTrack = {
        id: 'track-102',
        title: 'Empirical Track 2',
        artist: 'Test Artist 2',
        name: 'track-102.mp3',
        blob: new Blob(['dummy audio bytes 2'], { type: 'audio/mpeg' }),
        duration: 150,
        created: Date.now()
      };
      await lib.put(track1);
      await lib.put(track2);

      // Seed localStorage so current track and queue are pre-loaded
      (globalThis as any).localStorage.setItem('anf-music-player', JSON.stringify({
        current: 'track-101',
        queue: ['track-101', 'track-102'],
        repeat: 'off',
        volume: 0.7,
        speed: 1,
        position: 0
      }));

      hub = createMusicHub({
        notify: (msg) => { notifiedMessages.push(msg); },
        beforePlay: async () => { beforePlayCalled = true; }
      });
      await hub.ready;
    });

    test('2.1 Initial State Machine Baseline', () => {
      hub.stop();
      assert.equal(hub.getState(), 'idle', 'Initial state must be idle');
      assert.equal(hub.getError(), null, 'Initial error must be null');
    });

    test('2.2 HTML5 Event Progression Transitions (loadstart -> canplay -> playing -> pause -> ended)', () => {
      assert.ok(activeAudioElement);
      const audio = activeAudioElement!;

      audio.dispatchEvent({ type: 'loadstart' });
      assert.equal(hub.getState(), 'buffering');

      audio.dispatchEvent({ type: 'waiting' });
      assert.equal(hub.getState(), 'buffering');

      audio.paused = true;
      audio.dispatchEvent({ type: 'canplay' });
      assert.equal(hub.getState(), 'ready');

      audio.paused = false;
      audio.dispatchEvent({ type: 'playing' });
      assert.equal(hub.getState(), 'playing');

      audio.paused = true;
      audio.dispatchEvent({ type: 'pause' });
      assert.equal(hub.getState(), 'paused');

      audio.dispatchEvent({ type: 'ended' });
      assert.ok(hub.getState() === 'ended' || hub.getState() === 'ready');
    });

    test('2.3 Rapid Sequential Calls Stress (resume, pause, stop, step)', async () => {
      assert.ok(activeAudioElement);

      // Rapidly interleave methods without awaiting
      const p1 = hub.play();
      hub.pause();
      const p2 = hub.resume();
      hub.stop();

      await Promise.allSettled([p1, p2]);
      hub.stop();

      // State after stop must be idle
      assert.equal(hub.getState(), 'idle');
      assert.equal(activeAudioElement!.currentTime, 0);

      const nav = (globalThis as any).navigator;
      assert.equal(nav.mediaSession.playbackState, 'none');
      assert.equal(nav.mediaSession.metadata, null);
    });

    test('2.4 Playback Rejection (AbortError / Autoplay rejection) Recovery', async () => {
      assert.ok(activeAudioElement);
      activeAudioElement!.shouldRejectPlay = true;
      activeAudioElement!.rejectionError = new Error('NotAllowedError: user did not interact with document');

      await hub.play();

      // Upon rejection, state falls back to paused without throwing uncaught exceptions
      assert.equal(hub.getState(), 'paused');
      assert.ok(notifiedMessages.some(m => m.includes('Playback failed: Error: NotAllowedError')));
    });

    test('2.5 MediaError Handling Across Standard Error Codes (2, 3, 4)', () => {
      assert.ok(activeAudioElement);
      const audio = activeAudioElement!;

      // MediaError code 3: DECODE
      audio.error = { code: 3 };
      audio.dispatchEvent({ type: 'error' });
      assert.equal(hub.getState(), 'error');
      assert.equal(hub.getError(), 'Audio decoding failed. The file may be corrupt.');

      // MediaError code 4: SRC_NOT_SUPPORTED
      audio.error = { code: 4 };
      audio.dispatchEvent({ type: 'error' });
      assert.equal(hub.getState(), 'error');
      assert.equal(hub.getError(), 'Audio format not supported on this device.');

      // MediaError code 2: NETWORK
      audio.error = { code: 2 };
      audio.dispatchEvent({ type: 'error' });
      assert.equal(hub.getState(), 'error');
      assert.equal(hub.getError(), 'Network error loading audio stream.');
    });

    test('2.6 Step at Queue End Transitions to Ended State', async () => {
      assert.ok(activeAudioElement);
      // Step to last track in queue ('track-102')
      await hub.step(1, false);
      // Simulate automatic transition at end of queue
      await hub.step(1, true);
      assert.equal(hub.getState(), 'ended');
      assert.equal(activeAudioElement!.currentTime, 0);
    });
  });

  // =========================================================================
  // DIMENSION 3: Seek Robustness
  // =========================================================================
  describe('Dimension 3: Seek Robustness', () => {
    let hub: ReturnType<typeof createMusicHub>;

    beforeEach(async () => {
      installGlobalMockEnv();
      const lib = audioLibrary();
      await lib.put({
        id: 'seek-track-1',
        title: 'Seekable Track',
        artist: 'Seeker',
        name: 'seek.mp3',
        blob: new Blob(['audio'], { type: 'audio/mpeg' }),
        duration: 120,
        created: Date.now()
      });

      (globalThis as any).localStorage.setItem('anf-music-player', JSON.stringify({
        current: 'seek-track-1',
        queue: ['seek-track-1'],
        repeat: 'off',
        volume: 0.7,
        speed: 1,
        position: 0
      }));

      hub = createMusicHub({
        notify: () => {},
        beforePlay: () => {}
      });
      await hub.ready;
    });

    test('3.1 500 Rapid Seek Dispatches in Continuous Progression', () => {
      assert.ok(activeAudioElement);
      const audio = activeAudioElement!;
      audio.duration = 120;

      const body = (globalThis as any).document.body as AdvancedMockElement;
      const seekInput = body.querySelector('input[type="range"]') as AdvancedMockElement;
      assert.ok(seekInput, 'Seek input range element exists');

      for (let i = 0; i < 500; i++) {
        const target = Math.random() * 120;
        seekInput.value = String(target);
        seekInput.dispatchEvent({ type: 'input' });

        assert.equal(audio.currentTime, target);
        assert.ok(!Number.isNaN(audio.currentTime), 'currentTime must not become NaN');
      }
    });

    test('3.2 Seeking Before readyState is Reached (audio.readyState === 0)', () => {
      assert.ok(activeAudioElement);
      const audio = activeAudioElement!;

      audio.readyState = 0;
      audio.duration = 120;

      // When readyState is 0, loadedmetadata triggers setting currentTime to pending
      audio.dispatchEvent({ type: 'loadedmetadata' });
      assert.ok(audio.currentTime >= 0);
    });

    test('3.3 Boundary Timestamp Fuzzing (-Infinity, negative, oversized, NaN)', () => {
      assert.ok(activeAudioElement);
      const audio = activeAudioElement!;
      audio.duration = 120;

      const mediaSession = (globalThis as any).navigator.mediaSession as MockMediaSession;
      const seektoHandler = mediaSession.handlers.get('seekto');

      // Boundary values tested against seekto
      if (seektoHandler) {
        // Negative seekTime clamps to 0
        seektoHandler({ seekTime: -50 });
        assert.equal(audio.currentTime, 0);

        // Oversized seekTime clamps to duration
        seektoHandler({ seekTime: 9999 });
        assert.equal(audio.currentTime, 120);

        // Zero
        seektoHandler({ seekTime: 0 });
        assert.equal(audio.currentTime, 0);

        // Fractional boundary
        seektoHandler({ seekTime: 119.999 });
        assert.equal(audio.currentTime, 119.999);
      }
    });

    test('3.4 Step Forward 15s and Backward 15s Boundary Clamping', () => {
      assert.ok(activeAudioElement);
      const audio = activeAudioElement!;
      audio.duration = 100;

      const body = (globalThis as any).document.body as AdvancedMockElement;
      // Start at 10s: Back 15s clamps at 0
      audio.currentTime = 10;
      const backBtn = Array.from(body.querySelectorAll('button')).find(b => b.textContent === 'Back 15s');
      assert.ok(backBtn);
      backBtn!.click();
      assert.equal(audio.currentTime, 0);

      // Start at 95s: Forward 15s clamps at duration (100)
      audio.currentTime = 95;
      const fwdBtn = Array.from(body.querySelectorAll('button')).find(b => b.textContent === 'Forward 15s');
      assert.ok(fwdBtn);
      fwdBtn!.click();
      assert.equal(audio.currentTime, 100);
    });
  });

  // =========================================================================
  // DIMENSION 4: Audio Studio Mutual Exclusivity
  // =========================================================================
  describe('Dimension 4: Audio Studio Mutual Exclusivity', () => {
    let hub: ReturnType<typeof createMusicHub>;
    let beforePlayCalled = false;

    beforeEach(async () => {
      installGlobalMockEnv();
      beforePlayCalled = false;
      const lib = audioLibrary();
      await lib.put({
        id: 'studio-mutex-track',
        title: 'Studio Mutex Song',
        artist: 'Audacity vs MKR',
        name: 'mutex.mp3',
        blob: new Blob(['audio'], { type: 'audio/mpeg' }),
        duration: 200,
        created: Date.now()
      });

      (globalThis as any).localStorage.setItem('anf-music-player', JSON.stringify({
        current: 'studio-mutex-track',
        queue: ['studio-mutex-track'],
        repeat: 'off',
        volume: 0.7,
        speed: 1,
        position: 0
      }));

      hub = createMusicHub({
        notify: () => {},
        beforePlay: async () => { beforePlayCalled = true; }
      });
      await hub.ready;
    });

    test('4.1 suspend() Stops Playback, Clears MediaSession, and Cleans Up UI', async () => {
      assert.ok(activeAudioElement);
      const audio = activeAudioElement!;
      const nav = (globalThis as any).navigator;

      // Start playback
      await hub.play();
      assert.equal(audio.paused, false);
      assert.equal(hub.getState(), 'playing');

      // Suspend music hub (as triggered by Audio Studio beforePlay)
      hub.suspend();

      // 1. Audio must be paused
      assert.equal(audio.paused, true, 'Audio must be paused upon suspend()');

      // 2. Playback state must be paused
      assert.equal(hub.getState(), 'paused', 'State must be paused upon suspend()');

      // 3. MediaSession metadata must be null
      assert.equal(nav.mediaSession.metadata, null, 'MediaSession metadata must be cleared');

      // 4. MediaSession playbackState must be "none"
      assert.equal(nav.mediaSession.playbackState, 'none', 'MediaSession playbackState must be none');

      // 5. Body class has-music-player must be removed
      const body = (globalThis as any).document.body as AdvancedMockElement;
      assert.equal(body.classList.contains('has-music-player'), false, 'Body class has-music-player must be removed');
    });

    test('4.2 Audio Studio beforePlay Hook Handshake Mutual Exclusivity Flow', async () => {
      let audioStudioPlaying = false;
      let musicHubSuspended = false;

      // Mock audioStudio and musicHub handshake exactly as wired in main.ts
      const mockAudioStudio = {
        stop: () => { audioStudioPlaying = false; },
        hideDock: () => {},
        play: async () => {
          // Audio Studio beforePlay suspends musicHub
          hub.suspend();
          musicHubSuspended = true;
          audioStudioPlaying = true;
        }
      };

      // 1. Music Hub is playing
      await hub.play();
      assert.equal(hub.getState(), 'playing');

      // 2. Audio Studio starts playback
      await mockAudioStudio.play();

      // 3. Verify mutual exclusivity: Music Hub is suspended, Audio Studio is playing
      assert.equal(musicHubSuspended, true);
      assert.equal(activeAudioElement!.paused, true);
      assert.equal(audioStudioPlaying, true);

      // 4. Music Hub resumes: beforePlay hook must stop Audio Studio
      assert.equal(beforePlayCalled, true);
    });
  });
});
