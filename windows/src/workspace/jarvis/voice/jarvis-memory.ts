/**
 * Kevo conversational and factual memory (Phase 3 Step 3.1).
 * Stores persistent user facts and bounded turns across restarts.
 * Backed by native Rust storage (`Bridge.kevoMemory*`) with localStorage fallback.
 */
import { Bridge } from '../../../core/bridge';

export type JarvisTurn = { role: 'user' | 'assistant'; text: string; at: number };

export type KevoFact = {
  id: string;
  fact: string;
  category: string;
  created_at: number;
  updated_at: number;
};

const STORAGE_KEY = 'jarvis-convo-history';
const FACTS_STORAGE_KEY = 'jarvis-facts-history';
const MAX_TURNS = 20;

let memory: JarvisTurn[] = loadTurns();
let localFacts: KevoFact[] = loadFacts();

/**
 * Kevo giving the same long answer twice in a row came from Kevo hearing itself (fixed 14 Nov 2026).
 * Such a history would steer every new answer, so it is dropped. Short repeated answers are normal.
 */
export function healHistory(turns: JarvisTurn[]): JarvisTurn[] {
  const answers = turns.filter((t) => t.role === 'assistant').map((t) => t.text);
  return answers.some((text, i) => i > 0 && text.length > 80 && text === answers[i - 1]) ? [] : turns;
}

function loadTurns(): JarvisTurn[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JarvisTurn[];
    if (!Array.isArray(parsed)) return [];
    const turns = parsed
      .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
      .slice(-MAX_TURNS);
    return healHistory(turns);
  } catch {
    return [];
  }
}

function persistTurns(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memory.slice(-MAX_TURNS)));
    }
  } catch {
    /* session-only */
  }
}

function loadFacts(): KevoFact[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(FACTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as KevoFact[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistFacts(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(localFacts));
    }
  } catch {
    /* session-only */
  }
}

function hasTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI__?.core?.invoke);
}

/** Synchronizes conversation history from native storage into memory. */
export async function syncJarvisHistoryFromNative(limit = MAX_TURNS): Promise<void> {
  try {
    if (hasTauri() && typeof Bridge.kevoMemoryLoadHistory === 'function') {
      const nativeTurns = await Bridge.kevoMemoryLoadHistory(limit);
      if (nativeTurns && Array.isArray(nativeTurns) && nativeTurns.length > 0) {
        memory = healHistory(nativeTurns.map((t) => ({ role: t.role, text: t.text, at: t.at })));
        persistTurns();
      }
    }
  } catch {
    /* use local fallback */
  }
}

export function appendJarvisTurn(role: 'user' | 'assistant', text: string): void {
  const clean = text.trim();
  if (!clean) return;
  const turn: JarvisTurn = { role, text: clean.slice(0, 4000), at: Date.now() };
  memory.push(turn);
  if (memory.length > MAX_TURNS) memory = memory.slice(-MAX_TURNS);
  persistTurns();

  try {
    if (hasTauri() && typeof Bridge.kevoMemorySaveTurn === 'function') {
      Bridge.kevoMemorySaveTurn(role, clean).catch(() => {});
    }
  } catch {
    /* non-blocking */
  }
}

export function getJarvisHistory(limit = MAX_TURNS): JarvisTurn[] {
  return memory.slice(-limit);
}

export function clearJarvisHistory(): void {
  memory = [];
  persistTurns();
  try {
    if (hasTauri() && typeof Bridge.kevoMemoryClearHistory === 'function') {
      Bridge.kevoMemoryClearHistory().catch(() => {});
    }
  } catch {
    /* non-blocking */
  }
}

/** Remembers a fact persistently. */
export async function rememberFact(fact: string, category?: string): Promise<KevoFact> {
  const clean = fact.trim();
  if (!clean) throw new Error('Fact cannot be empty');

  try {
    if (hasTauri() && typeof Bridge.kevoMemoryRememberFact === 'function') {
      const saved = await Bridge.kevoMemoryRememberFact(clean, category);
      if (saved && saved.id) {
        const existingIdx = localFacts.findIndex((f) => f.id === saved.id || (f.fact.toLowerCase() === clean.toLowerCase() && f.category === saved.category));
        if (existingIdx >= 0) localFacts[existingIdx] = saved;
        else localFacts.push(saved);
        persistFacts();
        return saved;
      }
    }
  } catch {
    /* fallback to localFacts */
  }

  const now = Date.now();
  const cat = category?.trim().toLowerCase() || 'general';
  const existing = localFacts.find((f) => f.fact.toLowerCase() === clean.toLowerCase() && f.category === cat);
  if (existing) {
    existing.updated_at = now;
    persistFacts();
    return existing;
  }

  const newFact: KevoFact = {
    id: `fact_${now}_${Math.floor(Math.random() * 100000)}`,
    fact: clean,
    category: cat,
    created_at: now,
    updated_at: now,
  };
  localFacts.push(newFact);
  persistFacts();
  return newFact;
}

/** Lists remembered facts, optionally filtering by query. */
export async function listFacts(query?: string): Promise<KevoFact[]> {
  try {
    if (hasTauri() && typeof Bridge.kevoMemoryListFacts === 'function') {
      const facts = await Bridge.kevoMemoryListFacts(query);
      if (Array.isArray(facts)) {
        localFacts = facts;
        persistFacts();
        return facts;
      }
    }
  } catch {
    /* fallback to localFacts */
  }

  const q = query?.trim().toLowerCase();
  if (!q) return [...localFacts];
  return localFacts.filter(
    (f) => f.fact.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
  );
}

/** Deletes a remembered fact by its ID. */
export async function deleteFact(id: string): Promise<boolean> {
  try {
    if (hasTauri() && typeof Bridge.kevoMemoryDeleteFact === 'function') {
      const res = await Bridge.kevoMemoryDeleteFact(id);
      localFacts = localFacts.filter((f) => f.id !== id);
      persistFacts();
      return Boolean(res);
    }
  } catch {
    /* fallback to localFacts */
  }

  const initialLen = localFacts.length;
  localFacts = localFacts.filter((f) => f.id !== id);
  const changed = localFacts.length !== initialLen;
  if (changed) persistFacts();
  return changed;
}

/** Clears all remembered facts. */
export async function clearFacts(): Promise<boolean> {
  try {
    if (hasTauri() && typeof Bridge.kevoMemoryClearFacts === 'function') {
      const res = await Bridge.kevoMemoryClearFacts();
      localFacts = [];
      persistFacts();
      return Boolean(res);
    }
  } catch {
    /* fallback to localFacts */
  }

  const had = localFacts.length > 0;
  localFacts = [];
  persistFacts();
  return had;
}

/** Formats remembered facts into Markdown bullet points for system prompt injection. */
export function formatRememberedFactsForPrompt(facts: KevoFact[], limit = 15): string {
  if (!facts || facts.length === 0) return '';
  const lines = facts
    .slice(-limit)
    .map((f) => `- [${f.category}] ${f.fact}`)
    .join('\n');
  return `\n# Remembered Facts\n${lines}\n`;
}

/** Compact transcript for local-model prompting. */
export function formatJarvisHistoryForPrompt(limit = MAX_TURNS): string {
  const turns = getJarvisHistory(limit);
  if (!turns.length) return '';
  return turns
    .map((t) => `${t.role === 'user' ? 'User' : 'Kevo'}: ${t.text}`)
    .join('\n');
}
