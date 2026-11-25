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

export type NoteBacklink = {
  id: string;
  title: string;
  snippet: string;
};

export async function fetchNoteBacklinks(
  targetId: string,
  targetTitle: string,
  notes: RelatedNoteInput[],
): Promise<NoteBacklink[]> {
  if (!targetId || notes.length === 0) return [];
  return invoke<NoteBacklink[]>('workspace_note_backlinks', {
    targetId,
    targetTitle,
    notes,
  });
}

export type VaultTagCount = {
  tag: string;
  count: number;
  noteIds: string[];
};

export async function fetchVaultTags(notes: RelatedNoteInput[]): Promise<VaultTagCount[]> {
  if (notes.length === 0) return [];
  return invoke<VaultTagCount[]>('workspace_vault_tags', { notes });
}

export type BrokenWikiLink = {
  sourceId: string;
  sourceTitle: string;
  target: string;
};

export async function fetchBrokenWikiLinks(notes: RelatedNoteInput[]): Promise<BrokenWikiLink[]> {
  if (notes.length === 0) return [];
  return invoke<BrokenWikiLink[]>('workspace_broken_wiki_links', { notes });
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
