import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {
  constructor(public textContent: string = '') {}
}

class FakeEl {
  children: (FakeEl | FakeNode)[] = [];
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners: Record<string, ((e: any) => void)[]> = {};
  classList = {
    classes: new Set<string>(),
    add(...cls: string[]) { for (const c of cls) this.classes.add(c); },
    remove(...cls: string[]) { for (const c of cls) this.classes.delete(c); },
    toggle(c: string, force?: boolean) {
      if (force === true) { this.classes.add(c); return true; }
      if (force === false) { this.classes.delete(c); return false; }
      if (this.classes.has(c)) { this.classes.delete(c); return false; }
      this.classes.add(c); return true;
    },
    contains(c: string) { return this.classes.has(c); },
  };
  private _className = '';
  get className(): string { return this._className; }
  set className(v: string) {
    this._className = v;
    this.classList.classes.clear();
    for (const c of v.split(/\s+/)) if (c) this.classList.add(c);
  }
  textContent = '';
  innerHTML = '';
  hidden = false;
  disabled = false;

  constructor(public tag: string) {}

  append(...items: (FakeEl | FakeNode)[]) {
    this.children.push(...items);
  }

  setAttribute(k: string, v: string) {
    this.attributes[k] = v;
    if (k === 'class') {
      this.className = v;
    }
  }

  getAttribute(k: string): string | null {
    return this.attributes[k] ?? null;
  }

  addEventListener(type: string, fn: (e: any) => void) {
    (this.listeners[type] ??= []).push(fn);
  }

  click() {
    for (const fn of this.listeners['click'] ?? []) fn({ preventDefault() {} });
  }

  querySelector<T = FakeEl>(selector: string): T | null {
    const isClass = selector.startsWith('.');
    const cls = isClass ? selector.slice(1) : '';
    const match = (el: FakeEl): boolean => {
      if (isClass) {
        if (el.className.split(/\s+/).includes(cls) || el.classList.contains(cls)) return true;
      } else if (el.tag === selector.toLowerCase()) {
        return true;
      }
      return false;
    };

    const search = (node: FakeEl): FakeEl | null => {
      for (const child of node.children) {
        if (child instanceof FakeEl) {
          if (match(child)) return child;
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };

    return search(this) as unknown as T;
  }
}

const g = globalThis as any;
const origDocument = g.document;

if (typeof g.document === 'undefined') {
  g.document = {
    createElement: (tag: string) => new FakeEl(tag),
    createTextNode: (text: string) => new FakeNode(text),
  };
}

import { createDeskCompanionView, type DeskCompanionState } from '../../android/web/desk-companion';

describe('Kevo Phase 8 Step 8.1: Android Desk Companion View & UI Components', () => {
  it('instantiates desk companion view with default idle state', () => {
    const companion = createDeskCompanionView();
    assert.ok(companion.root, 'root element exists');
    assert.strictEqual(companion.getState(), 'idle');
    assert.strictEqual(companion.getLevel(), 0);
  });

  it('updates state transitions correctly across all supported Kevo states', () => {
    const companion = createDeskCompanionView();
    const states: DeskCompanionState[] = ['off', 'idle', 'listening', 'thinking', 'speaking', 'alert'];

    for (const st of states) {
      companion.setState(st);
      assert.strictEqual(companion.getState(), st);
      assert.strictEqual(companion.root.getAttribute('data-state'), st);
    }
  });

  it('clamps speech loudness levels safely between 0 and 1', () => {
    const companion = createDeskCompanionView();
    companion.setState('speaking');

    companion.setLevel(0.75);
    assert.strictEqual(companion.getLevel(), 0.75);

    // Negative values clamp to 0
    companion.setLevel(-0.5);
    assert.strictEqual(companion.getLevel(), 0);

    // Values > 1 clamp to 1
    companion.setLevel(1.8);
    assert.strictEqual(companion.getLevel(), 1);
  });

  it('resets level to 0 when state transitions away from speech or listening', () => {
    const companion = createDeskCompanionView();
    companion.setState('speaking');
    companion.setLevel(0.8);
    assert.strictEqual(companion.getLevel(), 0.8);

    companion.setState('idle');
    assert.strictEqual(companion.getLevel(), 0);
  });

  it('displays and handles remote approval requests cleanly (HUD H.4)', () => {
    let approvedId: string | null = null;
    let approvalOutcome: boolean | null = null;

    const companion = createDeskCompanionView({
      onApprove: (id, approved) => {
        approvedId = id;
        approvalOutcome = approved;
      },
    });

    companion.showApprovalRequest({
      id: 'req-42',
      action: 'Send file to Android',
      summary: 'Send vault note "Meeting Notes.md" to phone',
    });

    assert.strictEqual(companion.getState(), 'alert');

    // Simulate clicking approve
    const approveBtn = companion.root.querySelector<FakeEl>('.desk-approve-btn');
    assert.ok(approveBtn, 'approve button exists');
    approveBtn.click();

    assert.strictEqual(approvedId, 'req-42');
    assert.strictEqual(approvalOutcome, true);
    assert.strictEqual(companion.getState(), 'idle');
  });

  it('handles remote denial of approval requests cleanly', () => {
    let approvedId: string | null = null;
    let approvalOutcome: boolean | null = null;

    const companion = createDeskCompanionView({
      onApprove: (id, approved) => {
        approvedId = id;
        approvalOutcome = approved;
      },
    });

    companion.showApprovalRequest({
      id: 'req-99',
      action: 'Delete local log file',
      summary: 'Delete kevo.log from disk',
    });

    // Simulate clicking deny
    const denyBtn = companion.root.querySelector<FakeEl>('.desk-deny-btn');
    assert.ok(denyBtn, 'deny button exists');
    denyBtn.click();

    assert.strictEqual(approvedId, 'req-99');
    assert.strictEqual(approvalOutcome, false);
    assert.strictEqual(companion.getState(), 'idle');
  });

  it('toggles connection badge between connected and offline states', () => {
    const companion = createDeskCompanionView();
    companion.setConnected(true, 'Main-PC');

    const badge = companion.root.querySelector<FakeEl>('.desk-connection-badge');
    assert.ok(badge);
    assert.ok(badge.textContent?.includes('Main-PC Connected'));
    assert.ok(badge.classList.contains('connected'));

    companion.setConnected(false);
    assert.ok(badge.textContent?.includes('Offline'));
    assert.ok(badge.classList.contains('disconnected'));
  });

  it('triggers exit callback when exit button clicked', () => {
    let exited = false;
    const companion = createDeskCompanionView({
      onExit: () => { exited = true; },
    });

    const exitBtn = companion.root.querySelector<FakeEl>('.desk-exit-btn');
    assert.ok(exitBtn);
    exitBtn.click();
    assert.strictEqual(exited, true);
  });
});
