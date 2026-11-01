// Headless test environment for AnF workspace E2E tests
// Polyfills and mocks browser globals (localStorage, DOMParser, indexedDB, document, window, Audio, URL object URLs)

export class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

export class MockElement {
  tagName: string;
  attributes: Record<string, string> = {};
  children: MockElement[] = [];
  private _textContent = '';
  get textContent(): string {
    if (this.children.length === 0) return this._textContent;
    return this.children.map(c => c.textContent).join('');
  }
  set textContent(val: string) {
    this._textContent = val;
  }
  className = '';
  style: Record<string, string> & { setProperty?: (k: string, v: string) => void } = {
    setProperty: (k: string, v: string) => { (this.style as Record<string, string>)[k] = v; }
  };
  parentElement: MockElement | null = null;
  dataset: Record<string, string> = {};
  listeners: Record<string, EventListener[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toLowerCase();
  }

  getAttribute(name: string): string | null {
    const val = this.attributes[name.toLowerCase()];
    return val !== undefined ? val : null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name.toLowerCase()] = String(value);
  }

  removeAttribute(name: string): void {
    delete this.attributes[name.toLowerCase()];
  }

  append(...nodes: (MockElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new MockElement('#text');
        textNode.textContent = node;
        textNode.parentElement = this;
        this.children.push(textNode);
        this.textContent += node;
      } else if (node instanceof MockElement) {
        node.parentElement = this;
        this.children.push(node);
        this.textContent += node.textContent;
      }
    }
  }

  replaceChildren(...nodes: (MockElement | string)[]): void {
    this.children = [];
    this.textContent = '';
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
    const list = this.listeners[event.type] || [];
    for (const l of list) l(event as unknown as Event);
    return true;
  }

  querySelector(selector: string): MockElement | null {
    const results = this.querySelectorAll(selector);
    return results[0] || null;
  }

  querySelectorAll(selector: string): MockElement[] {
    // Handle comma-separated selectors e.g. "itunes\\:image, image"
    const subSelectors = selector.split(',').map(s => s.trim().replace(/\\:/g, ':').toLowerCase());
    const matches: MockElement[] = [];

    const testMatch = (el: MockElement, sel: string): boolean => {
      // Descendant selector e.g. "image url"
      if (sel.includes(' ')) {
        const parts = sel.split(/\s+/);
        let curr: MockElement | null = el;
        for (let i = parts.length - 1; i >= 0; i--) {
          const part = parts[i];
          if (!curr || !testMatch(curr, part)) return false;
          curr = curr.parentElement;
        }
        return true;
      }
      if (sel.startsWith('#')) return el.getAttribute('id') === sel.slice(1);
      if (sel.startsWith('.')) return el.className.split(/\s+/).includes(sel.slice(1));
      return el.tagName === sel;
    };

    const traverse = (node: MockElement) => {
      for (const child of node.children) {
        if (child.tagName !== '#text') {
          for (const sel of subSelectors) {
            if (testMatch(child, sel)) {
              if (!matches.includes(child)) matches.push(child);
              break;
            }
          }
          traverse(child);
        }
      }
    };

    traverse(this);
    return matches;
  }
}

export class MockDOMParser {
  parseFromString(source: string, _mimeType: string): MockElement {
    const root = new MockElement('#document');
    let current: MockElement = root;
    const stack: MockElement[] = [root];

    // Preserve CDATA sections as text content
    source = source.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, cdata) => {
      return cdata.replace(/&/g, '\uE000').replace(/</g, '\uE001').replace(/>/g, '\uE002');
    });

    // Simple robust XML/HTML tag token regex
    const tagRegex = /<([!\/?]?[\w:-]+)([^>]*?)(\/?)>|([^<]+)/gs;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(source)) !== null) {
      const [_, tagName, attrString, isSelfClosing, textContent] = match;

      if (textContent) {
        const decoded = textContent.replace(/\uE000/g, '&').replace(/\uE001/g, '<').replace(/\uE002/g, '>');
        if (decoded) {
          const textNode = new MockElement('#text');
          textNode.textContent = decoded;
          textNode.parentElement = current;
          current.children.push(textNode);
        }
        continue;
      }

      if (!tagName) continue;

      if (tagName.startsWith('!--') || tagName.startsWith('!DOCTYPE') || tagName.startsWith('?')) {
        // Comment or XML declaration; skip
        continue;
      }

      if (tagName.startsWith('/')) {
        // Closing tag
        if (stack.length > 1) {
          stack.pop();
          current = stack[stack.length - 1];
        }
        continue;
      }

      // Opening tag
      const element = new MockElement(tagName);
      if (attrString) {
        const attrRegex = /([\w:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
        let attrMatch: RegExpExecArray | null;
        while ((attrMatch = attrRegex.exec(attrString)) !== null) {
          const key = attrMatch[1];
          const val = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
          element.setAttribute(key, val);
        }
      }

      element.parentElement = current;
      current.children.push(element);

      if (!isSelfClosing && !['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(tagName.toLowerCase())) {
        stack.push(element);
        current = element;
      }
    }

    return root;
  }
}

export class MockIDBObjectStore {
  private data = new Map<string, unknown>();
  constructor(public name: string, public keyPath: string = 'id') {}

  put(value: unknown): { onsuccess?: () => void; onerror?: (e: unknown) => void } {
    const key = (value as Record<string, unknown>)[this.keyPath] as string;
    this.data.set(key, value);
    const req: { onsuccess?: () => void; onerror?: (e: unknown) => void } = {};
    queueMicrotask(() => req.onsuccess?.());
    return req;
  }

  get(key: string): { result?: unknown; onsuccess?: () => void; onerror?: (e: unknown) => void } {
    const req: { result?: unknown; onsuccess?: () => void; onerror?: (e: unknown) => void } = {
      result: this.data.get(key)
    };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  }

  getAll(): { result?: unknown[]; onsuccess?: () => void; onerror?: (e: unknown) => void } {
    const req: { result?: unknown[]; onsuccess?: () => void; onerror?: (e: unknown) => void } = {
      result: Array.from(this.data.values())
    };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  }

  delete(key: string): { onsuccess?: () => void; onerror?: (e: unknown) => void } {
    this.data.delete(key);
    const req: { onsuccess?: () => void; onerror?: (e: unknown) => void } = {};
    queueMicrotask(() => req.onsuccess?.());
    return req;
  }
}

export class MockIDBTransaction {
  constructor(private db: MockIDBDatabase, public mode: string) {}
  oncomplete?: () => void;
  onerror?: (e: unknown) => void;
  onabort?: () => void;

  objectStore(name: string): MockIDBObjectStore {
    const store = this.db.stores.get(name);
    if (!store) throw new Error(`NotFoundError: The specified object store "${name}" was not found.`);
    // Trigger oncomplete after current microtask queue
    queueMicrotask(() => this.oncomplete?.());
    return store;
  }
}

export class MockIDBDatabase {
  stores = new Map<string, MockIDBObjectStore>();
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name)
  };
  onversionchange?: () => void;

  createObjectStore(name: string, options?: { keyPath?: string }): MockIDBObjectStore {
    const store = new MockIDBObjectStore(name, options?.keyPath || 'id');
    this.stores.set(name, store);
    return store;
  }

  transaction(storeNames: string | string[], mode = 'readonly'): MockIDBTransaction {
    return new MockIDBTransaction(this, mode);
  }

  close(): void {}
}

export class MockIDBFactory {
  private databases = new Map<string, MockIDBDatabase>();

  open(name: string, _version?: number): {
    result?: MockIDBDatabase;
    error?: unknown;
    onsuccess?: () => void;
    onerror?: (e: unknown) => void;
    onupgradeneeded?: () => void;
    onblocked?: () => void;
  } {
    const req: {
      result?: MockIDBDatabase;
      error?: unknown;
      onsuccess?: () => void;
      onerror?: (e: unknown) => void;
      onupgradeneeded?: () => void;
      onblocked?: () => void;
    } = {};

    let db = this.databases.get(name);
    const isNew = !db;
    if (!db) {
      db = new MockIDBDatabase();
      this.databases.set(name, db);
    }
    req.result = db;

    queueMicrotask(() => {
      if (isNew && req.onupgradeneeded) {
        req.onupgradeneeded();
      }
      req.onsuccess?.();
    });

    return req;
  }
}

export class MockAudio {
  src = '';
  preload = '';
  currentTime = 0;
  duration = 180;
  volume = 0.7;
  paused = true;
  readyState = 4;
  listeners: Record<string, EventListener[]> = {};

  addEventListener(event: string, fn: EventListener): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event: string, fn: EventListener): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(l => l !== fn);
  }

  async play(): Promise<void> {
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  load(): void {
    this.readyState = 4;
  }
}

export function setupTestEnvironment(): void {
  const g = globalThis as unknown as Record<string, unknown>;

  if (!g.localStorage) {
    g.localStorage = new MockStorage();
  }

  if (!g.DOMParser) {
    g.DOMParser = MockDOMParser;
  }

  if (!g.indexedDB) {
    g.indexedDB = new MockIDBFactory();
  }

  if (!g.Audio) {
    g.Audio = MockAudio;
  }

  if (!g.document) {
    const docElement = new MockElement('html');
    const head = new MockElement('head');
    const body = new MockElement('body');
    docElement.append(head, body);

    g.document = {
      documentElement: docElement,
      head,
      body,
      createElement: (tag: string) => new MockElement(tag),
      createTextNode: (text: string) => {
        const el = new MockElement('#text');
        el.textContent = text;
        return el;
      },
      createElementNS: (_ns: string, tag: string) => new MockElement(tag),
      getElementById: (id: string) => docElement.querySelector('#' + id),
      dispatchEvent: (_evt: unknown) => true,
      addEventListener: (_type: string, _fn: unknown) => {},
      removeEventListener: (_type: string, _fn: unknown) => {}
    };
  }

  if (!g.window) {
    g.window = {
      devicePixelRatio: 1,
      addEventListener: (_type: string, _fn: unknown) => {},
      removeEventListener: (_type: string, _fn: unknown) => {},
      dispatchEvent: (_evt: unknown) => true
    };
  }

  if (!URL.createObjectURL) {
    URL.createObjectURL = (_blob: unknown) => 'blob:mock-uuid-' + Math.random().toString(36).slice(2);
  }

  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = (_url: string) => {};
  }
}
