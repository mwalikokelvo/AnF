/**
 * Kevo conversational memory — last N turns for askAI context.
 * Destructive single store (no V1/V2 stacks). localStorage-backed when available.
 */

export type JarvisTurn = { role: 'user' | 'assistant'; text: string; at: number };

const STORAGE_KEY = 'jarvis-convo-history';
const MAX_TURNS = 20;

let memory: JarvisTurn[] = load();

/**
 * Kevo giving the same long answer twice in a row came from Kevo hearing itself (fixed 14 Nov 2026).
 * Such a history would steer every new answer, so it is dropped. Short repeated answers are normal.
 */
export function healHistory(turns: JarvisTurn[]): JarvisTurn[] {
  const answers = turns.filter((t) => t.role === 'assistant').map((t) => t.text);
  return answers.some((text, i) => i > 0 && text.length > 80 && text === answers[i - 1]) ? [] : turns;
}

function load(): JarvisTurn[] {
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

function persist(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memory.slice(-MAX_TURNS)));
    }
  } catch {
    /* session-only */
  }
}

export function appendJarvisTurn(role: 'user' | 'assistant', text: string): void {
  const clean = text.trim();
  if (!clean) return;
  memory.push({ role, text: clean.slice(0, 4000), at: Date.now() });
  if (memory.length > MAX_TURNS) memory = memory.slice(-MAX_TURNS);
  persist();
}

export function getJarvisHistory(limit = MAX_TURNS): JarvisTurn[] {
  return memory.slice(-limit);
}

export function clearJarvisHistory(): void {
  memory = [];
  persist();
}

/** Compact transcript for local-model prompting. */
export function formatJarvisHistoryForPrompt(limit = MAX_TURNS): string {
  const turns = getJarvisHistory(limit);
  if (!turns.length) return '';
  return turns
    .map((t) => `${t.role === 'user' ? 'User' : 'Kevo'}: ${t.text}`)
    .join('\n');
}
