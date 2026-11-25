import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment, MockElement } from './e2e/test-env.js';

describe('UI Pass 1: Writing view Tools dropdown and full focus mode (#257)', () => {
  let createWritingEditor: typeof import('../src/workspace/writing.js').createWritingEditor;

  before(async () => {
    setupTestEnvironment();

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
          },
        };
      },
      configurable: true,
    });

    const origDispatch = MockElement.prototype.dispatchEvent;
    MockElement.prototype.dispatchEvent = function (event: any) {
      if (!event.stopPropagation) {
        event.stopPropagation = () => {
          event.cancelBubble = true;
        };
      }
      if (!event.preventDefault) {
        event.preventDefault = () => {
          event.defaultPrevented = true;
        };
      }
      if (!event.target) event.target = this;
      return origDispatch.call(this, event);
    };

    MockElement.prototype.click = function () {
      this.dispatchEvent({
        type: 'click',
        preventDefault() {},
        stopPropagation() {},
        target: this,
        currentTarget: this,
      });
    };

    MockElement.prototype.focus = function () {
      (globalThis.document as any).activeElement = this;
    };

    MockElement.prototype.contains = function (node: any) {
      let curr = node;
      while (curr) {
        if (curr === this) return true;
        curr = curr.parentElement;
      }
      return false;
    };

    const mod = await import('../src/workspace/writing.js');
    createWritingEditor = mod.createWritingEditor;
  });

  function makeEditor(initialText = 'Hello world') {
    const draft = document.createElement('textarea') as unknown as HTMLTextAreaElement;
    draft.value = initialText;
    draft.selectionStart = 0;
    draft.selectionEnd = 0;
    return {
      draft,
      editor: createWritingEditor(draft, () => {}, () => {}),
    };
  }

  function dispatchKey(el: Element, key: string) {
    const ev: any = {
      type: 'keydown',
      key,
      defaultPrevented: false,
      cancelBubble: false,
      preventDefault() {
        ev.defaultPrevented = true;
      },
      stopPropagation() {
        ev.cancelBubble = true;
      },
      target: el,
    };
    el.dispatchEvent(ev);
    return ev;
  }

  it('keeps exactly 7 core formatting controls in the primary toolbar and moves secondary tools into Tools menu', () => {
    const { editor } = makeEditor();
    const toolbar = editor.root.querySelector('.editor-tools')!;
    const primaryButtons = Array.from(toolbar.children).filter(
      (el) => el.tagName.toUpperCase() === 'BUTTON'
    );
    assert.deepEqual(
      primaryButtons.map((b) => b.textContent),
      ['Heading', 'Bold', 'Italic', 'Bullet list', 'Checklist', 'Wiki link', 'Quote']
    );

    const trigger = toolbar.querySelector('.writing-tools-trigger')!;
    assert.equal(trigger.textContent, 'Tools \u25be');
    assert.equal(trigger.getAttribute('aria-haspopup'), 'menu');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');

    const menu = toolbar.querySelector('.writing-tools-dropdown')! as HTMLElement;
    assert.equal(menu.getAttribute('role'), 'menu');
    assert.equal(menu.hidden, true);

    const menuItems = Array.from(menu.children)
      .filter((el) => el.getAttribute('role') === 'menuitem')
      .map((b) => b.textContent);
    for (const expected of [
      'Audit SEO',
      'Storyboard',
      'Swarm Review',
      'Bionic View',
      'Scan/OCR',
      'Article Frontmatter',
      'Outline',
      'Export Article',
    ]) {
      assert.ok(menuItems.includes(expected), `Expected ${expected} in Tools menu`);
    }
  });

  it('opens Tools menu with Enter or Space, supports arrow keys, and closes with Esc', () => {
    const { editor } = makeEditor();
    const trigger = editor.root.querySelector('.writing-tools-trigger')! as HTMLElement;
    const menu = editor.root.querySelector('.writing-tools-dropdown')! as HTMLElement;
    const items = Array.from(menu.children).filter(
      (el) => el.getAttribute('role') === 'menuitem'
    ) as HTMLElement[];

    // Open with Enter -> focuses first item
    dispatchKey(trigger, 'Enter');
    assert.equal(menu.hidden, false);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(document.activeElement, items[0]);

    // ArrowDown moves to second item
    dispatchKey(menu, 'ArrowDown');
    assert.equal(document.activeElement, items[1]);

    // ArrowUp wraps back to first then last
    dispatchKey(menu, 'ArrowUp');
    assert.equal(document.activeElement, items[0]);
    dispatchKey(menu, 'ArrowUp');
    assert.equal(document.activeElement, items[items.length - 1]);

    // Esc closes menu and returns focus to trigger
    dispatchKey(menu, 'Escape');
    assert.equal(menu.hidden, true);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement, trigger);

    // Space also opens the menu
    dispatchKey(trigger, ' ');
    assert.equal(menu.hidden, false);
    assert.equal(document.activeElement, items[0]);
  });

  it('toggles writing-focus-mode on document.body without removing DOM state, and restores on Esc or toggle', () => {
    const { draft, editor } = makeEditor('My draft stays intact');
    const controls = editor.root.querySelector('.editor-view-controls')!;
    const focusBtn = Array.from(controls.children).find(
      (b) => b.textContent === 'Focus mode'
    )! as HTMLElement;

    assert.equal(document.body.classList.contains('writing-focus-mode'), false);
    assert.equal(editor.root.getAttribute('data-focus'), null);

    // Enable focus mode
    focusBtn.click();
    assert.equal(document.body.classList.contains('writing-focus-mode'), true);
    assert.equal(editor.root.getAttribute('data-focus'), 'true');
    assert.equal(focusBtn.textContent, 'Exit focus mode');
    assert.equal(focusBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(draft.value, 'My draft stays intact');

    // Esc exits focus mode
    dispatchKey(editor.root, 'Escape');
    assert.equal(document.body.classList.contains('writing-focus-mode'), false);
    assert.equal(editor.root.getAttribute('data-focus'), 'false');
    assert.equal(focusBtn.textContent, 'Focus mode');
    assert.equal(draft.value, 'My draft stays intact');

    // Re-enable and exit via same toggle button
    focusBtn.click();
    assert.equal(document.body.classList.contains('writing-focus-mode'), true);
    focusBtn.click();
    assert.equal(document.body.classList.contains('writing-focus-mode'), false);
  });
});
