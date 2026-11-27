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

export type NoteReadingStats = {
  id: string;
  wordCount: number;
  readingMinutes: number;
  headingCount: number;
  linkCount: number;
};

export async function fetchNoteReadingStats(
  note: RelatedNoteInput,
  wpm = 220,
): Promise<NoteReadingStats> {
  return invoke<NoteReadingStats>('workspace_note_reading_stats', { note, wpm });
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

export type NoteOutlineHeading = {
  level: number;
  text: string;
  line: number;
};

export async function fetchNoteOutline(note: RelatedNoteInput): Promise<NoteOutlineHeading[]> {
  if (!note.text.trim()) return [];
  return invoke<NoteOutlineHeading[]>('workspace_note_outline', { note });
}

export type StubNoteEntry = {
  id: string;
  title: string;
  wordCount: number;
};

export async function fetchStubNotes(
  notes: RelatedNoteInput[],
  minWords = 15,
): Promise<StubNoteEntry[]> {
  if (!notes.length) return [];
  return invoke<StubNoteEntry[]>('workspace_stub_notes', { notes, minWords });
}

export type VaultWordGoalProgress = {
  totalWords: number;
  targetWords: number;
  remainingWords: number;
  completionPct: number;
  goalMet: boolean;
};

export async function fetchVaultWordGoal(
  notes: RelatedNoteInput[],
  targetWords = 1000,
): Promise<VaultWordGoalProgress> {
  return invoke<VaultWordGoalProgress>('workspace_vault_word_goal', { notes, targetWords });
}

export type VaultSearchHit = {
  id: string;
  title: string;
  line: number;
  snippet: string;
  matchCount: number;
};

export async function searchVaultNotesNative(
  notes: RelatedNoteInput[],
  query: string,
  limit = 20,
): Promise<VaultSearchHit[]> {
  if (!notes.length || !query.trim()) return [];
  return invoke<VaultSearchHit[]>('workspace_search_vault_notes', { notes, query, limit });
}
