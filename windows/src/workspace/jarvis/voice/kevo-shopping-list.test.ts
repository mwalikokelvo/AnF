import { describe, it, expect, beforeEach } from 'vitest';
import {
  addShoppingItem,
  listShoppingItems,
  clearShoppingList,
  formatShoppingList,
} from './kevo-shopping-list';

// Mock localStorage for tests
const store: Record<string, string> = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  global.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: () => null,
  } as any;
});

describe('kevo-shopping-list', () => {
  it('adds and lists items', () => {
    addShoppingItem('milk');
    addShoppingItem('bread', 2);
    const items = listShoppingItems();
    expect(items.length).toBe(2);
    expect(items[0].name).toBe('milk');
    expect(items[1].quantity).toBe(2);
  });

  it('clears the list', () => {
    addShoppingItem('eggs');
    expect(clearShoppingList()).toBe(1);
    expect(listShoppingItems().length).toBe(0);
  });

  it('formats empty and non-empty lists', () => {
    expect(formatShoppingList()).toContain('empty');
    addShoppingItem('apples');
    expect(formatShoppingList()).toContain('apples');
  });
});
