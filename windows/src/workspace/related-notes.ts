import { invoke } from '@tauri-apps/api/core';
import { h } from '../views/dom';

export type RelatedNoteInput = {
  id: string;
  title: string;
  text: string;
};

export type RelatedNote = {
  id: string;
  title: string;
  score: number;
};

export type VaultHealthSummary = {
  totalNotes: number;
  totalWords: number;
  emptyNotes: number;
  distinctTerms: number;
};

export async function fetchVaultHealth(notes: RelatedNoteInput[]): Promise<VaultHealthSummary> {
  return invoke<VaultHealthSummary>('workspace_vault_health', { notes });
}

/**
 * Queries the Rust `workspace_related_notes` Tauri command (`anf_vault::related`)
 * to rank related notes on-device via IDF-weighted cosine similarity.
 */
export async function fetchRelatedNotes(
  source: RelatedNoteInput,
  notes: RelatedNoteInput[],
  limit = 5,
): Promise<RelatedNote[]> {
  if (!source.id || notes.length === 0) return [];
  return invoke<RelatedNote[]>('workspace_related_notes', { source, notes, limit });
}

export function renderRelatedNotes(
  container: HTMLElement,
  items: RelatedNote[],
  onOpen: (id: string) => void,
): void {
  if (!items.length) {
    container.replaceChildren(
      h('h3', { class: 'history-heading', text: 'Related notes' }),
      h('p', { class: 'hint', text: 'No related notes yet.' }),
    );
    return;
  }
  container.replaceChildren(
    h('h3', { class: 'history-heading', text: 'Related notes' }),
    ...items.map((item) => {
      const btn = h(
        'button',
        {
          class: 'history-item',
          type: 'button',
          title: `${item.title} (${Math.round(item.score * 100)}% match)`,
        },
        h('strong', { text: item.title }),
        h('small', { text: `${Math.round(item.score * 100)}% match` }),
      ) as HTMLButtonElement;
      btn.addEventListener('click', () => onOpen(item.id));
      return btn;
    }),
  );
}
