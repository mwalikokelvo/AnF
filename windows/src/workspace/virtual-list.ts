/**
 * Shared Virtual List Helper.
 *
 * Implements fixed row height virtualization with overscan.
 * Driven strictly by scroll events with requestAnimationFrame used ONLY for drawing.
 * Keyboard focus and screen-reader order preserved.
 *
 * Part of UI Pass 1 (Issue #260).
 */

export interface VirtualListOptions<T> {
  itemHeight: number;
  overscan?: number;
  renderItem: (item: T, index: number) => HTMLElement;
  emptyPlaceholder?: HTMLElement | null;
  className?: string;
  role?: string;
  ariaLabel?: string;
  scrollContainer?: HTMLElement | Window | (() => HTMLElement | Window | null);
  maxHeight?: string;
}

export interface VirtualList<T> {
  root: HTMLElement;
  content: HTMLElement;
  setItems(items: readonly T[]): void;
  getItems(): readonly T[];
  getRenderedCount(): number;
  refresh(): void;
  scrollToIndex(index: number): void;
  destroy(): void;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delayMs = 150): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

export function createVirtualList<T>(options: VirtualListOptions<T>): VirtualList<T> {
  const {
    itemHeight,
    overscan = 3,
    renderItem,
    emptyPlaceholder,
    className = 'virtual-list',
    role = 'list',
    ariaLabel,
    scrollContainer: customScrollContainer,
    maxHeight,
  } = options;

  let allItems: readonly T[] = [];
  let rafId: number | null = null;
  let lastStart = -1;
  let lastEnd = -1;

  const root = document.createElement('div');
  root.className = className;
  if (role) root.setAttribute('role', role);
  if (ariaLabel) root.setAttribute('aria-label', ariaLabel);

  const content = document.createElement('div');
  content.className = 'virtual-list-content';
  content.style.position = 'relative';
  content.style.width = '100%';
  content.style.boxSizing = 'border-box';
  root.appendChild(content);

  let currentScrollEl: HTMLElement | Window = root;

  function resolveScrollContainer(): HTMLElement | Window {
    if (typeof customScrollContainer === 'function') {
      const el = customScrollContainer();
      if (el) return el;
    } else if (customScrollContainer) {
      return customScrollContainer;
    }
    const found = root.closest ? (root.closest('.panel-host') as HTMLElement | null) : null;
    if (found) return found;
    return root;
  }

  function attachScrollListener(target: HTMLElement | Window) {
    if (currentScrollEl === target) return;
    try {
      currentScrollEl.removeEventListener('scroll', onScroll as EventListener);
    } catch {}
    currentScrollEl = target;
    try {
      currentScrollEl.addEventListener('scroll', onScroll as EventListener, { passive: true });
    } catch {}

    if (currentScrollEl === root) {
      root.style.overflowY = 'auto';
      if (maxHeight) root.style.maxHeight = maxHeight;
    } else {
      root.style.overflowY = 'visible';
      if (maxHeight) root.style.maxHeight = '';
    }
  }

  // Initial setup
  const initialTarget = resolveScrollContainer();
  attachScrollListener(initialTarget);

  function renderVisibleWindow() {
    const total = allItems.length;
    if (total === 0) {
      content.style.paddingTop = '0px';
      content.style.paddingBottom = '0px';
      content.replaceChildren(emptyPlaceholder ? emptyPlaceholder : '');
      lastStart = -1;
      lastEnd = -1;
      return;
    }

    const scrollEl = resolveScrollContainer();
    attachScrollListener(scrollEl);

    let scrollTop = 0;
    let clientHeight = 400;

    if (scrollEl === root) {
      scrollTop = root.scrollTop || 0;
      clientHeight = root.clientHeight || 400;
    } else if (typeof window !== 'undefined' && scrollEl === window) {
      try {
        const rootRect = root.getBoundingClientRect();
        scrollTop = Math.max(0, -rootRect.top);
        clientHeight = window.innerHeight || 400;
      } catch {
        scrollTop = 0;
        clientHeight = 400;
      }
    } else if (typeof (scrollEl as HTMLElement).getBoundingClientRect === 'function') {
      try {
        const rootRect = root.getBoundingClientRect();
        const scrollRect = (scrollEl as HTMLElement).getBoundingClientRect();
        scrollTop = Math.max(0, scrollRect.top - rootRect.top);
        clientHeight = (scrollEl as HTMLElement).clientHeight || scrollRect.height || 400;
      } catch {
        scrollTop = (scrollEl as HTMLElement).scrollTop || 0;
        clientHeight = (scrollEl as HTMLElement).clientHeight || 400;
      }
    } else {
      scrollTop = (scrollEl as any).scrollTop || 0;
      clientHeight = (scrollEl as any).clientHeight || 400;
    }

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(total, Math.ceil((scrollTop + clientHeight) / itemHeight) + overscan);

    if (startIndex === lastStart && endIndex === lastEnd) {
      return;
    }

    lastStart = startIndex;
    lastEnd = endIndex;

    const topPad = startIndex * itemHeight;
    const bottomPad = Math.max(0, (total - endIndex) * itemHeight);

    content.style.paddingTop = `${topPad}px`;
    content.style.paddingBottom = `${bottomPad}px`;

    const fragment = document.createDocumentFragment();
    for (let i = startIndex; i < endIndex; i++) {
      const el = renderItem(allItems[i], i);
      fragment.appendChild(el);
    }
    content.replaceChildren(fragment);
  }

  function scheduleDraw() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      renderVisibleWindow();
    });
  }

  function onScroll() {
    scheduleDraw();
  }

  return {
    root,
    content,
    setItems(newItems: readonly T[]) {
      allItems = newItems;
      lastStart = -1;
      lastEnd = -1;
      renderVisibleWindow();
    },
    getItems() {
      return allItems;
    },
    getRenderedCount() {
      return content.children.length;
    },
    refresh() {
      lastStart = -1;
      lastEnd = -1;
      renderVisibleWindow();
    },
    scrollToIndex(index: number) {
      const scrollEl = resolveScrollContainer();
      attachScrollListener(scrollEl);
      const targetTop = Math.max(0, index * itemHeight);
      if (scrollEl === root) {
        root.scrollTop = targetTop;
      } else if (typeof window !== 'undefined' && scrollEl === window) {
        try {
          const rootRect = root.getBoundingClientRect();
          window.scrollTo({ top: window.scrollY + rootRect.top + targetTop });
        } catch {}
      } else if ('scrollTop' in scrollEl) {
        try {
          const rootRect = root.getBoundingClientRect();
          const scrollRect = (scrollEl as HTMLElement).getBoundingClientRect();
          const currentOffset = rootRect.top - scrollRect.top;
          (scrollEl as HTMLElement).scrollTop += currentOffset + targetTop;
        } catch {
          (scrollEl as HTMLElement).scrollTop = targetTop;
        }
      }
      renderVisibleWindow();
    },
    destroy() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      try {
        currentScrollEl.removeEventListener('scroll', onScroll as EventListener);
      } catch {}
    },
  };
}
