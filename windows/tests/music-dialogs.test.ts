import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { askConfirm, askText } from '../src/workspace/music-dialogs.js';

type MockNode = {
  tag: string;
  className: string;
  textContent: string;
  value: string;
  children: MockNode[];
  parent: MockNode | null;
  listeners: Map<string, EventListener[]>;
  attrs: Record<string, string>;
  append: (...nodes: unknown[]) => void;
  addEventListener: (type: string, fn: EventListener) => void;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  remove: () => void;
  focus: () => void;
  select: () => void;
  close: () => void;
  showModal: () => void;
};

function installDom() {
  const fire = (el: MockNode, type: string, event?: Event) => {
    for (const fn of el.listeners.get(type) ?? []) fn(event ?? new Event(type));
  };

  const create = (tag: string): MockNode => {
    const el: MockNode = {
      tag,
      className: '',
      textContent: '',
      value: '',
      children: [],
      parent: null,
      listeners: new Map(),
      attrs: {},
      append(...nodes) {
        for (const node of nodes) {
          if (!node || typeof node !== 'object') continue;
          const child = node as MockNode;
          child.parent = el;
          el.children.push(child);
        }
      },
      addEventListener(type, fn) {
        const list = el.listeners.get(type) ?? [];
        list.push(fn);
        el.listeners.set(type, list);
      },
      setAttribute(name, value) {
        el.attrs[name] = value;
        if (name === 'value') el.value = value;
      },
      getAttribute(name) {
        return el.attrs[name] ?? null;
      },
      remove() {
        if (el.parent) el.parent.children = el.parent.children.filter(c => c !== el);
      },
      focus() {},
      select() {},
      close() {
        fire(el, 'close');
      },
      showModal() {},
    };
    return el;
  };

  const body = create('body');

  const document = {
    body,
    createElement(tag: string) {
      return create(tag) as unknown as HTMLElement;
    },
    createTextNode(text: string) {
      return { text } as unknown as Text;
    },
  };

  (globalThis as { document?: typeof document }).document = document as unknown as Document;
  return { body, fire, create };
}

describe('music-dialogs', () => {
  let dom: ReturnType<typeof installDom>;

  beforeEach(() => {
    dom = installDom();
  });

  afterEach(() => {
    delete (globalThis as { document?: Document }).document;
  });

  function findButton(root: MockNode, label: string): MockNode {
    const stack = [root];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.tag === 'button' && node.textContent === label) return node;
      stack.push(...node.children);
    }
    throw new Error('button ' + label);
  }

  function findInput(root: MockNode): MockNode {
    const stack = [root];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.tag === 'input') return node;
      stack.push(...node.children);
    }
    throw new Error('input missing');
  }

  test('askText resolves entered text on OK', async () => {
    const pending = askText('Playlist name');
    const dialog = dom.body.children.at(-1)!;
    assert.equal(dialog.tag, 'dialog');
    findInput(dialog).value = 'Evening';
    dom.fire(findButton(dialog, 'OK'), 'click');
    assert.equal(await pending, 'Evening');
    assert.equal(dom.body.children.length, 0);
  });

  test('askText resolves null on Cancel', async () => {
    const pending = askText('Playlist name');
    const dialog = dom.body.children.at(-1)!;
    dom.fire(findButton(dialog, 'Cancel'), 'click');
    assert.equal(await pending, null);
  });

  test('askText keeps empty string when OK with no input', async () => {
    const pending = askText('Playlist name');
    const dialog = dom.body.children.at(-1)!;
    dom.fire(findButton(dialog, 'OK'), 'click');
    assert.equal(await pending, '');
  });

  test('askConfirm resolves true on OK and false on Cancel', async () => {
    const yes = askConfirm('Delete Evening?');
    const dialog = dom.body.children.at(-1)!;
    dom.fire(findButton(dialog, 'OK'), 'click');
    assert.equal(await yes, true);

    const no = askConfirm('Delete Evening?');
    const dialog2 = dom.body.children.at(-1)!;
    dom.fire(findButton(dialog2, 'Cancel'), 'click');
    assert.equal(await no, false);
  });
});
