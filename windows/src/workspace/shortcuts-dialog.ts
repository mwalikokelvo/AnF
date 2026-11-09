/**
 * Keyboard Shortcuts Guide & Cheat Sheet
 *
 * Provides a clean modal displaying all keyboard shortcuts across AnF:
 * Global navigation, Deep Reader, Audio Hub, and Writing Studio.
 */

import { h } from '../views/dom';

export interface ShortcutItem {
  keys: string[];
  description: string;
}

export interface ShortcutCategory {
  category: string;
  items: ShortcutItem[];
}

export const APP_SHORTCUTS: ShortcutCategory[] = [
  {
    category: 'Global & Navigation',
    items: [
      { keys: ['Ctrl', 'K'], description: 'Open Command Palette & Universal Note Search' },
      { keys: ['?'], description: 'Show Keyboard Shortcuts cheat sheet' },
      { keys: ['Ctrl', '/'], description: 'Show Keyboard Shortcuts cheat sheet' },
      { keys: ['Esc'], description: 'Close current dialog or overlay' },
    ],
  },
  {
    category: 'Audio Player & Music Studio',
    items: [
      { keys: ['Space'], description: 'Play or pause audio playback' },
      { keys: ['←'], description: 'Skip backward 15 seconds' },
      { keys: ['→'], description: 'Skip forward 30 seconds' },
      { keys: ['M'], description: 'Toggle audio mute / unmute' },
      { keys: ['S'], description: 'Toggle queue shuffle' },
      { keys: ['R'], description: 'Cycle repeat mode (Off / All / One)' },
    ],
  },
  {
    category: 'Deep Reader',
    items: [
      { keys: ['Ctrl', 'F'], description: 'Search inside document text' },
      { keys: ['Enter'], description: 'Jump to next search match' },
      { keys: ['Shift', 'Enter'], description: 'Jump to previous search match' },
      { keys: ['←'], description: 'Navigate to previous section' },
      { keys: ['→'], description: 'Navigate to next section' },
    ],
  },
  {
    category: 'Writing Studio',
    items: [
      { keys: ['Ctrl', 'B'], description: 'Bold selection (**text**)' },
      { keys: ['Ctrl', 'I'], description: 'Italicize selection (*text*)' },
      { keys: ['Ctrl', 'Z'], description: 'Undo formatting edit' },
      { keys: ['Ctrl', 'Y'], description: 'Redo formatting edit' },
    ],
  },
];

/**
 * Checks whether an event originated from a text input or textarea.
 */
export function isInputFocused(target: any): boolean {
  if (!target || typeof target !== 'object') return false;
  const tag = typeof target.tagName === 'string' ? target.tagName.toLowerCase() : '';
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target.isContentEditable);
}

/**
 * Opens the keyboard shortcuts guide dialog.
 */
export function openShortcutsDialog(): HTMLDialogElement {
  const dialog = h('dialog', {
    class: 'music-dialog shortcuts-dialog',
    'aria-label': 'Keyboard Shortcuts Guide',
  });

  const categories = APP_SHORTCUTS.map((cat) => {
    const list = h('div', { class: 'shortcuts-list', style: 'display: grid; gap: 6px; margin: 8px 0 16px;' });
    for (const item of cat.items) {
      const keysWrap = h('div', { style: 'display: flex; gap: 4px; align-items: center;' });
      for (const k of item.keys) {
        keysWrap.append(h('kbd', {
          text: k,
          style: 'padding: 2px 6px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; font-family: monospace; font-size: 11px; font-weight: bold; color: var(--music-accent, #79e4b4);',
        }));
      }
      const row = h('div', { style: 'display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06);' },
        h('span', { text: item.description, style: 'font-size: 13px;' }),
        keysWrap
      );
      list.append(row);
    }
    return h('div', { class: 'shortcuts-category' },
      h('h4', { text: cat.category, style: 'margin: 0 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--music-muted, #8fa0a3);' }),
      list
    );
  });

  const closeBtn = h('button', {
    type: 'button',
    text: 'Close Shortcuts',
    onclick: () => {
      dialog.close();
      dialog.remove();
    },
  });

  dialog.append(
    h('h3', { text: '⌨ Keyboard Shortcuts' }),
    h('p', { class: 'hint', text: 'Work faster and navigate without touching your mouse.' }),
    ...categories,
    h('div', { class: 'row', style: 'margin-top: 14px;' }, closeBtn)
  );

  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
