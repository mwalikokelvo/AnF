import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualList, debounce } from '../src/workspace/virtual-list';

// Simple polyfill for document / HTMLElement in Node test runner if needed
if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement(tag: string) {
      const children: any[] = [];
      const attributes: Record<string, string> = {};
      const listeners: Record<string, Function[]> = {};
      const el: any = {
        tagName: tag.toUpperCase(),
        className: '',
        style: {},
        children,
        scrollTop: 0,
        clientHeight: 400,
        appendChild(child: any) {
          children.push(child);
          return child;
        },
        replaceChildren(...nodes: any[]) {
          children.length = 0;
          for (const n of nodes) {
            if (n && n.nodeType === 11) { // Fragment
              children.push(...n.children);
            } else if (n) {
              children.push(n);
            }
          }
        },
        setAttribute(k: string, v: string) {
          attributes[k] = v;
        },
        getAttribute(k: string) {
          return attributes[k] ?? null;
        },
        addEventListener(event: string, fn: Function) {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        },
        removeEventListener(event: string, fn: Function) {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((cb) => cb !== fn);
          }
        },
        dispatchEvent(event: any) {
          const cbs = listeners[event.type || event] || [];
          for (const cb of cbs) cb(event);
        },
        getBoundingClientRect() {
          return { top: 0, bottom: 400, height: 400, left: 0, right: 300, width: 300 };
        },
      };
      return el;
    },
    createDocumentFragment() {
      const children: any[] = [];
      return {
        nodeType: 11,
        children,
        appendChild(child: any) {
          children.push(child);
          return child;
        },
      };
    },
  };
}

if (typeof requestAnimationFrame === 'undefined') {
  (globalThis as any).requestAnimationFrame = (cb: Function) => setTimeout(cb, 0);
  (globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
}

test('createVirtualList renders empty placeholder when item list is empty', () => {
  const emptyPlaceholder = document.createElement('p');
  emptyPlaceholder.className = 'empty-msg';

  const list = createVirtualList<{ id: string }>({
    itemHeight: 50,
    emptyPlaceholder,
    renderItem: (item) => {
      const el = document.createElement('div');
      el.className = 'item-' + item.id;
      return el;
    },
  });

  list.setItems([]);
  assert.equal(list.getRenderedCount(), 1);
  assert.equal(list.content.style.paddingTop, '0px');
  assert.equal(list.content.style.paddingBottom, '0px');
});

test('5,000 rows render only the visible window (Issue #260)', () => {
  interface RowItem {
    id: number;
    title: string;
  }

  const items: RowItem[] = [];
  for (let i = 0; i < 5000; i++) {
    items.push({ id: i, title: `Track #${i}` });
  }

  const rowHeight = 40;
  const overscan = 4;
  const viewportHeight = 400; // 10 visible items

  const list = createVirtualList<RowItem>({
    itemHeight: rowHeight,
    overscan,
    renderItem: (item) => {
      const el = document.createElement('div');
      el.className = 'virtual-row';
      el.setAttribute('data-id', String(item.id));
      return el;
    },
  });

  list.root.clientHeight = viewportHeight;
  list.setItems(items);

  const renderedCount = list.getRenderedCount();
  // 10 visible items + 4 overscan below = 14 items rendered
  assert.ok(renderedCount <= 20, `Rendered count (${renderedCount}) must be far below 5,000`);
  assert.ok(renderedCount >= 10, `Rendered count (${renderedCount}) must at least cover viewport`);

  // Verify virtual spacer heights
  const paddingTop = parseInt(list.content.style.paddingTop || '0', 10);
  const paddingBottom = parseInt(list.content.style.paddingBottom || '0', 10);
  assert.equal(paddingTop, 0, 'Top padding should be 0 at scrollTop = 0');
  assert.equal(
    paddingTop + paddingBottom + renderedCount * rowHeight,
    5000 * rowHeight,
    'Total scroll height must equal 5,000 * 40px (200,000px)'
  );

  // Scroll down to row 1000 (scrollTop = 40,000px)
  list.root.scrollTop = 40000;
  list.refresh();

  const newRenderedCount = list.getRenderedCount();
  assert.ok(newRenderedCount <= 25, 'Rendered count after scroll must remain small');

  const newPaddingTop = parseInt(list.content.style.paddingTop || '0', 10);
  const newPaddingBottom = parseInt(list.content.style.paddingBottom || '0', 10);

  assert.ok(newPaddingTop > 30000, 'Top padding must shift down');
  assert.equal(
    newPaddingTop + newPaddingBottom + newRenderedCount * rowHeight,
    5000 * rowHeight,
    'Total scroll height must remain consistent across scrolls'
  );
});

test('scrollToIndex jumps to the correct item position', () => {
  const items = Array.from({ length: 500 }, (_, i) => ({ id: i }));
  const list = createVirtualList<{ id: number }>({
    itemHeight: 50,
    renderItem: (item) => {
      const el = document.createElement('div');
      return el;
    },
  });

  list.root.clientHeight = 500;
  list.setItems(items);

  list.scrollToIndex(100);
  assert.equal(list.root.scrollTop, 5000);
});

test('debounce delays execution to 150 ms and batches rapid calls', async () => {
  let callCount = 0;
  let lastArg = '';

  const debounced = debounce((arg: string) => {
    callCount++;
    lastArg = arg;
  }, 150);

  debounced('a');
  debounced('b');
  debounced('c');

  assert.equal(callCount, 0, 'Must not call synchronously');

  await new Promise((r) => setTimeout(r, 80));
  assert.equal(callCount, 0, 'Must not call before 150 ms');

  await new Promise((r) => setTimeout(r, 100));
  assert.equal(callCount, 1, 'Must call exactly once after timeout');
  assert.equal(lastArg, 'c', 'Must receive final argument');
});
