/**
 * Kevo Shopping List: local persistent grocery/shopping list for voice control.
 * Stored in localStorage under 'kevo-shopping-list'.
 */

export interface ShoppingItem {
  id: string;
  name: string;
  addedAt: number;
  quantity?: number;
}

const STORAGE_KEY = 'kevo-shopping-list';

function load(): ShoppingItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(items: ShoppingItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
}

export function addShoppingItem(name: string, quantity = 1): ShoppingItem {
  const items = load();
  const item: ShoppingItem = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim(),
    quantity,
    addedAt: Date.now(),
  };
  items.push(item);
  save(items);
  return item;
}

export function listShoppingItems(): ShoppingItem[] {
  return load();
}

export function clearShoppingList(): number {
  const count = load().length;
  save([]);
  return count;
}

export function removeShoppingItem(nameOrId: string): boolean {
  const items = load();
  const before = items.length;
  const filtered = items.filter(
    (i) => i.id !== nameOrId && i.name.toLowerCase() !== nameOrId.toLowerCase()
  );
  save(filtered);
  return filtered.length < before;
}

export function formatShoppingList(): string {
  const items = load();
  if (items.length === 0) return 'Your shopping list is empty, sir.';
  const lines = items.map((i, idx) => `${idx + 1}. ${i.name}${i.quantity && i.quantity > 1 ? ` (x${i.quantity})` : ''}`);
  return `You have ${items.length} item${items.length === 1 ? '' : 's'} on your shopping list: ${lines.join('; ')}.`;
}
