/**
 * Simple local shopping / to-do list for Kevo.
 * Persists to localStorage in the desktop app, with in-memory fallback for headless/tests.
 */

const STORAGE_KEY = 'anf-kevo-shopping-list';

let memoryList: string[] = [];

function getStoredList(): string[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {}
  return memoryList;
}

function setStoredList(list: string[]): void {
  memoryList = list;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch {}
}

export function addToShoppingList(item: string): string {
  const clean = String(item || '').trim();
  if (!clean) return 'What should I add to your shopping list, sir?';
  const list = getStoredList();
  if (list.some((i) => i.toLowerCase() === clean.toLowerCase())) {
    return `${clean} is already on your shopping list, sir.`;
  }
  const next = [...list, clean];
  setStoredList(next);
  return `Added ${clean} to your shopping list. You now have ${next.length} ${next.length === 1 ? 'item' : 'items'}, sir.`;
}

export function listShoppingList(): string {
  const list = getStoredList();
  if (!list.length) return 'Your shopping list is empty, sir.';
  return `Your shopping list has ${list.length} ${list.length === 1 ? 'item' : 'items'}: ${list.join(', ')}.`;
}

export function clearShoppingList(): string {
  const list = getStoredList();
  const count = list.length;
  setStoredList([]);
  return `Cleared ${count} ${count === 1 ? 'item' : 'items'} from your shopping list, sir.`;
}

export function removeFromShoppingList(item: string): string {
  const clean = String(item || '').trim();
  if (!clean) return 'Which item should I remove, sir?';
  const list = getStoredList();
  const idx = list.findIndex((i) => i.toLowerCase() === clean.toLowerCase());
  if (idx === -1) return `${clean} was not on your shopping list, sir.`;
  const next = [...list];
  next.splice(idx, 1);
  setStoredList(next);
  return `Removed ${clean} from your shopping list. ${next.length} ${next.length === 1 ? 'item' : 'items'} left, sir.`;
}
