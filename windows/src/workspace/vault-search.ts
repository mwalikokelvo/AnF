/**
 * Vault search bridge: indexes KnowledgeNotes into Jev-Ultrafast BM25
 * and ranks Ctrl+K / voice queries. Operator filters (tag:, type:, has:,
 * read:>) stay on matchesNote; plain text uses BM25 ranking.
 */
import { matchesNote, type KnowledgeNote } from './knowledge-data';
import { JevIndex, type SearchResult } from './jev-index';

const OPERATOR_RE = /\b(tag:|type:|has:|read:>)/i;

export function hasSearchOperators(query: string): boolean {
  return OPERATOR_RE.test(query.trim());
}

export function buildVaultIndex(notes: KnowledgeNote[]): JevIndex {
  const index = new JevIndex();
  for (const note of notes) {
    const sourceText = note.sources
      .map((s) => `${s.name}\n${s.text || ''}`)
      .join('\n');
    index.addDocument({
      id: note.id,
      corpus: 'notes',
      title: note.name,
      content: `${note.draft || ''}\n${sourceText}`,
      metadata: { name: note.name },
    });
  }
  return index;
}

export function searchVaultNotes(
  notes: KnowledgeNote[],
  query: string,
  limit = 100
): KnowledgeNote[] {
  const q = query.trim();
  if (!q) return notes.slice(0, limit);
  if (hasSearchOperators(q)) {
    return notes.filter((n) => matchesNote(n, q)).slice(0, limit);
  }

  const index = buildVaultIndex(notes);
  const ranked = index.search(q, { limit });
  const byId = new Map(notes.map((n) => [n.id, n]));
  const ordered: KnowledgeNote[] = [];
  for (const hit of ranked) {
    const note = byId.get(hit.docId);
    if (note) ordered.push(note);
  }

  // Keep substring / fuzzy matches that BM25 may miss on short queries.
  if (ordered.length < limit) {
    const seen = new Set(ordered.map((n) => n.id));
    for (const note of notes) {
      if (seen.has(note.id)) continue;
      if (matchesNote(note, q)) {
        ordered.push(note);
        seen.add(note.id);
        if (ordered.length >= limit) break;
      }
    }
  }

  return ordered;
}

export function vaultSearchHits(
  notes: KnowledgeNote[],
  query: string,
  limit = 10
): SearchResult[] {
  const q = query.trim();
  if (!q || hasSearchOperators(q)) return [];
  return buildVaultIndex(notes).search(q, { limit });
}

export function summarizeVaultSearch(
  notes: KnowledgeNote[],
  query: string,
  limit = 5
): string {
  const q = query.trim();
  if (!q) return 'Say what to search for in your vault, sir.';
  const found = searchVaultNotes(notes, q, limit);
  if (!found.length) return `No vault matches for "${q}".`;
  const names = found.map((n) => n.name).join(', ');
  const more = found.length >= limit ? ' Top results only.' : '';
  return `Found ${found.length} note${found.length === 1 ? '' : 's'}: ${names}.${more}`;
}
