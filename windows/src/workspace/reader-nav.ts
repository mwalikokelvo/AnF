// Reader section bar: hide it while the text has focus, and show it again from the keyboard.
// The bar stays in document flow either way, so the reading column does not move.

export type ReaderNavMode = 'open' | 'collapsed';
export type ReaderNavZone = 'page' | 'navigation' | 'other';

export interface ReaderNavKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}

export function readerNavToggleShortcut(event: ReaderNavKey): boolean {
  if (event.repeat || event.altKey || event.shiftKey) return false;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return (event.ctrlKey || event.metaKey) && key === 'b';
}

export function readerNavZone(inPage: boolean, inNavigation: boolean): ReaderNavZone {
  if (inPage) return 'page';
  if (inNavigation) return 'navigation';
  return 'other';
}

export function readerNavModeAfterFocus(current: ReaderNavMode, zone: ReaderNavZone): ReaderNavMode {
  if (zone === 'page') return 'collapsed';
  if (zone === 'navigation') return 'open';
  return current;
}

export function nextReaderNavMode(current: ReaderNavMode): ReaderNavMode {
  return current === 'open' ? 'collapsed' : 'open';
}
