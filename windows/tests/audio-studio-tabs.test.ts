import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, MockElement } from './e2e/test-env.js';

describe('UI Pass 1: Audio Studio 3-Tab Sub-Navigation & Info Popover (#259)', () => {
  let createAudioStudio: typeof import('../src/workspace/audio-studio.js').createAudioStudio;

  before(async () => {
    setupTestEnvironment();

    // Enhance MockElement with interactive DOM methods & properties
    Object.defineProperty(MockElement.prototype, 'hidden', {
      get() {
        return this.getAttribute('hidden') !== null || Boolean(this._hidden);
      },
      set(v) {
        this._hidden = Boolean(v);
        if (v) this.setAttribute('hidden', '');
        else this.removeAttribute('hidden');
      },
      configurable: true,
    });

    Object.defineProperty(MockElement.prototype, 'tabIndex', {
      get() {
        const val = this.getAttribute('tabindex');
        return val !== null ? parseInt(val, 10) : 0;
      },
      set(v) {
        this.setAttribute('tabindex', String(v));
      },
      configurable: true,
    });

    Object.defineProperty(MockElement.prototype, 'classList', {
      get() {
        const self = this;
        return {
          add(...tokens: string[]) {
            const classes = new Set((self.className || '').split(/\s+/).filter(Boolean));
            tokens.forEach(t => classes.add(t));
            self.className = Array.from(classes).join(' ');
          },
          remove(...tokens: string[]) {
            const classes = new Set((self.className || '').split(/\s+/).filter(Boolean));
            tokens.forEach(t => classes.delete(t));
            self.className = Array.from(classes).join(' ');
          },
          contains(token: string) {
            return (self.className || '').split(/\s+/).includes(token);
          },
          toggle(token: string, force?: boolean) {
            const classes = new Set((self.className || '').split(/\s+/).filter(Boolean));
            const shouldAdd = force !== undefined ? force : !classes.has(token);
            if (shouldAdd) classes.add(token);
            else classes.delete(token);
            self.className = Array.from(classes).join(' ');
            return shouldAdd;
          }
        };
      },
      configurable: true,
    });

    const origDispatch = MockElement.prototype.dispatchEvent;
    MockElement.prototype.dispatchEvent = function (event: any) {
      if (!event.stopPropagation) event.stopPropagation = () => {};
      if (!event.preventDefault) event.preventDefault = () => {};
      if (!event.target) event.target = this;
      return origDispatch.call(this, event);
    };

    MockElement.prototype.click = function () {
      this.dispatchEvent({
        type: 'click',
        preventDefault() {},
        stopPropagation() {},
        target: this,
        currentTarget: this
      });
    };
    MockElement.prototype.focus = function () {};
    MockElement.prototype.scrollIntoView = function () {};
    MockElement.prototype.contains = function (node: any) {
      let curr = node;
      while (curr) {
        if (curr === this) return true;
        curr = curr.parentElement;
      }
      return false;
    };

    // Document event bus
    const docListeners: Record<string, EventListener[]> = {};
    (document as any).addEventListener = (type: string, fn: EventListener) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    };
    (document as any).removeEventListener = (type: string, fn: EventListener) => {
      if (docListeners[type]) {
        docListeners[type] = docListeners[type].filter(l => l !== fn);
      }
    };
    (document as any).dispatchEvent = (event: any) => {
      if (!event.stopPropagation) event.stopPropagation = () => {};
      if (!event.preventDefault) event.preventDefault = () => {};
      const list = docListeners[event.type] || [];
      for (const l of list) l(event as any);
      return true;
    };

    if (!globalThis.CustomEvent) {
      (globalThis as any).CustomEvent = class CustomEvent {
        type: string;
        detail: any;
        preventDefault() {}
        stopPropagation() {}
        constructor(type: string, opts: any = {}) {
          this.type = type;
          this.detail = opts?.detail;
        }
      };
    }

    if (!globalThis.KeyboardEvent) {
      (globalThis as any).KeyboardEvent = class KeyboardEvent {
        type: string;
        key: string;
        preventDefault() {}
        stopPropagation() {}
        constructor(type: string, opts: any = {}) {
          this.type = type;
          this.key = opts?.key || '';
        }
      };
    }

    const mod = await import('../src/workspace/audio-studio.js');
    createAudioStudio = mod.createAudioStudio;
  });

  it('renders a tablist with 3 tabs and corresponding panels', () => {
    const studio = createAudioStudio(() => {});
    const root = studio.root as any;

    const tablist = root.querySelector('.audio-studio-tabs');
    assert.ok(tablist, 'tablist container (.audio-studio-tabs) must exist');
    assert.strictEqual(tablist.getAttribute('role'), 'tablist');
    assert.strictEqual(tablist.getAttribute('aria-label'), 'Audio Studio Sections');

    const tabs = root.querySelectorAll('.audio-studio-tab');
    assert.strictEqual(tabs.length, 3, 'Must render exactly 3 tabs');

    // Tab 1: Library & Queue
    assert.strictEqual(tabs[0].getAttribute('role'), 'tab');
    assert.strictEqual(tabs[0].getAttribute('id'), 'audio-tab-library-queue');
    assert.strictEqual(tabs[0].getAttribute('aria-selected'), 'true');
    assert.strictEqual(tabs[0].getAttribute('aria-controls'), 'audio-panel-library-queue');
    assert.strictEqual(tabs[0].tabIndex, 0);

    // Tab 2: Convert & Transcode
    assert.strictEqual(tabs[1].getAttribute('role'), 'tab');
    assert.strictEqual(tabs[1].getAttribute('id'), 'audio-tab-convert-transcode');
    assert.strictEqual(tabs[1].getAttribute('aria-selected'), 'false');
    assert.strictEqual(tabs[1].getAttribute('aria-controls'), 'audio-panel-convert-transcode');
    assert.strictEqual(tabs[1].tabIndex, -1);

    // Tab 3: Screen & Clip Studio
    assert.strictEqual(tabs[2].getAttribute('role'), 'tab');
    assert.strictEqual(tabs[2].getAttribute('id'), 'audio-tab-screen-clip');
    assert.strictEqual(tabs[2].getAttribute('aria-selected'), 'false');
    assert.strictEqual(tabs[2].getAttribute('aria-controls'), 'audio-panel-screen-clip');
    assert.strictEqual(tabs[2].tabIndex, -1);

    // Panels
    const panels = root.querySelectorAll('.audio-studio-panel');
    assert.strictEqual(panels.length, 3, 'Must render exactly 3 tabpanels');
    assert.strictEqual(panels[0].getAttribute('role'), 'tabpanel');
    assert.strictEqual(panels[0].getAttribute('id'), 'audio-panel-library-queue');
    assert.strictEqual(panels[0].hidden, false, 'First panel must be active and not hidden');

    assert.strictEqual(panels[1].getAttribute('role'), 'tabpanel');
    assert.strictEqual(panels[1].getAttribute('id'), 'audio-panel-convert-transcode');
    assert.strictEqual(panels[1].hidden, true, 'Second panel must be hidden by default');

    assert.strictEqual(panels[2].getAttribute('role'), 'tabpanel');
    assert.strictEqual(panels[2].getAttribute('id'), 'audio-panel-screen-clip');
    assert.strictEqual(panels[2].hidden, true, 'Third panel must be hidden by default');
  });

  it('switches tabs on click and updates aria-selected and hidden state', () => {
    const studio = createAudioStudio(() => {});
    const root = studio.root as any;
    const tabs = root.querySelectorAll('.audio-studio-tab');
    const panels = root.querySelectorAll('.audio-studio-panel');

    // Click tab 1 (Convert & Transcode)
    tabs[1].click();
    assert.strictEqual(tabs[0].getAttribute('aria-selected'), 'false');
    assert.strictEqual(tabs[1].getAttribute('aria-selected'), 'true');
    assert.strictEqual(tabs[2].getAttribute('aria-selected'), 'false');

    assert.strictEqual(panels[0].hidden, true);
    assert.strictEqual(panels[1].hidden, false);
    assert.strictEqual(panels[2].hidden, true);

    // Click tab 2 (Screen & Clip Studio)
    tabs[2].click();
    assert.strictEqual(tabs[0].getAttribute('aria-selected'), 'false');
    assert.strictEqual(tabs[1].getAttribute('aria-selected'), 'false');
    assert.strictEqual(tabs[2].getAttribute('aria-selected'), 'true');

    assert.strictEqual(panels[0].hidden, true);
    assert.strictEqual(panels[1].hidden, true);
    assert.strictEqual(panels[2].hidden, false);
  });

  it('supports keyboard navigation via arrow keys with circular wrap and Home/End keys', () => {
    const studio = createAudioStudio(() => {});
    const root = studio.root as any;
    const tabs = root.querySelectorAll('.audio-studio-tab');
    const panels = root.querySelectorAll('.audio-studio-panel');

    // ArrowRight from tab 0 -> tab 1
    tabs[0].dispatchEvent(new (globalThis as any).KeyboardEvent('keydown', { key: 'ArrowRight' }));
    assert.strictEqual(tabs[1].getAttribute('aria-selected'), 'true');
    assert.strictEqual(panels[1].hidden, false);

    // ArrowRight from tab 1 -> tab 2
    tabs[1].dispatchEvent(new (globalThis as any).KeyboardEvent('keydown', { key: 'ArrowRight' }));
    assert.strictEqual(tabs[2].getAttribute('aria-selected'), 'true');
    assert.strictEqual(panels[2].hidden, false);

    // ArrowRight from tab 2 wraps to tab 0
    tabs[2].dispatchEvent(new (globalThis as any).KeyboardEvent('keydown', { key: 'ArrowRight' }));
    assert.strictEqual(tabs[0].getAttribute('aria-selected'), 'true');
    assert.strictEqual(panels[0].hidden, false);

    // ArrowLeft from tab 0 wraps to tab 2
    tabs[0].dispatchEvent(new (globalThis as any).KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    assert.strictEqual(tabs[2].getAttribute('aria-selected'), 'true');
    assert.strictEqual(panels[2].hidden, false);

    // Home goes to tab 0
    tabs[2].dispatchEvent(new (globalThis as any).KeyboardEvent('keydown', { key: 'Home' }));
    assert.strictEqual(tabs[0].getAttribute('aria-selected'), 'true');
    assert.strictEqual(panels[0].hidden, false);

    // End goes to tab 2
    tabs[0].dispatchEvent(new (globalThis as any).KeyboardEvent('keydown', { key: 'End' }));
    assert.strictEqual(tabs[2].getAttribute('aria-selected'), 'true');
    assert.strictEqual(panels[2].hidden, false);
  });

  it('renders (i) info button that toggles capabilities popover and closes on Esc', () => {
    const studio = createAudioStudio(() => {});
    const root = studio.root as any;

    const infoBtn = root.querySelector('.audio-studio-info-btn');
    assert.ok(infoBtn, '(i) info button must exist');
    assert.strictEqual(infoBtn.getAttribute('aria-label'), 'Capabilities and storage information');
    assert.strictEqual(infoBtn.getAttribute('aria-expanded'), 'false');

    const popover = root.querySelector('.audio-studio-info-popover');
    assert.ok(popover, 'Info popover element must exist');
    assert.strictEqual(popover.hidden, true, 'Popover is initially hidden');
    assert.ok(popover.textContent.includes('Playback streams local files'), 'Popover contains capabilities text');

    // Click opens popover
    infoBtn.click();
    assert.strictEqual(popover.hidden, false);
    assert.strictEqual(infoBtn.getAttribute('aria-expanded'), 'true');

    // Esc closes popover
    popover.dispatchEvent(new (globalThis as any).KeyboardEvent('keydown', { key: 'Escape' }));
    assert.strictEqual(popover.hidden, true);
    assert.strictEqual(infoBtn.getAttribute('aria-expanded'), 'false');
  });

  it('external anf-open-cap and anf-open-supoclip events switch to Screen & Clip Studio tab', () => {
    const studio = createAudioStudio(() => {});
    const root = studio.root as any;
    const tabs = root.querySelectorAll('.audio-studio-tab');
    const panels = root.querySelectorAll('.audio-studio-panel');

    assert.strictEqual(tabs[0].getAttribute('aria-selected'), 'true');

    // Dispatch anf-open-cap
    document.dispatchEvent(new (globalThis as any).CustomEvent('anf-open-cap'));
    assert.strictEqual(tabs[2].getAttribute('aria-selected'), 'true');
    assert.strictEqual(panels[2].hidden, false);

    // Switch back to tab 0
    tabs[0].click();
    assert.strictEqual(tabs[0].getAttribute('aria-selected'), 'true');

    // Dispatch anf-open-supoclip
    document.dispatchEvent(new (globalThis as any).CustomEvent('anf-open-supoclip'));
    assert.strictEqual(tabs[2].getAttribute('aria-selected'), 'true');
    assert.strictEqual(panels[2].hidden, false);
  });
});
