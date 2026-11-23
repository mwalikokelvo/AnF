/**
 * Simple local shopping / to-do list for Kevo.
 * Stored in memory for the session; in full app would persist via vault or local file.
 */
let shoppingList: string[] = [];

export function addToShoppingList(item: string): string {
  const clean = item.trim();
  if (!clean) return 'What should I add?';
  if (shoppingList.includes(clean.toLowerCase())) return `${clean} is already on the list.`;
  shoppingList.push(clean);
  return `Added ${clean} to your shopping list. You now have ${shoppingList.length} items.`;
}

export function listShoppingList(): string {
  if (!shoppingList.length) return 'Your shopping list is empty.';
  return `Your shopping list: ${shoppingList.join(', ')}.`;
}

export function clearShoppingList(): string {
  const count = shoppingList.length;
  shoppingList = [];
  return `Cleared ${count} items from your shopping list.`;
}

export function removeFromShoppingList(item: string): string {
  const idx = shoppingList.findIndex(i => i.toLowerCase() === item.toLowerCase());
  if (idx === -1) return `${item} was not on the list.`;
  shoppingList.splice(idx, 1);
  return `Removed ${item}. ${shoppingList.length} items left.`;
}
