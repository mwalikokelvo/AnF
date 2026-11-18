/**
 * Kevo Dictionary: Word definitions via free public Dictionary API.
 * https://dictionaryapi.dev/ - no key, free, documented.
 * Inspired by capabilities in Siri, Google Assistant, Alexa (define words).
 * Does not copy proprietary code; uses public HTTP API.
 */

export interface DictionaryMeaning {
  partOfSpeech?: string;
  definitions: Array<{ definition: string; example?: string }>;
}

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  meanings: DictionaryMeaning[];
}

export async function lookupWord(word: string): Promise<DictionaryEntry | null> {
  const clean = word.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '');
  if (!clean || clean.length > 50) return null;

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const entry = data[0];
    return {
      word: entry.word || clean,
      phonetic: entry.phonetic,
      meanings: (entry.meanings || []).map((m: any) => ({
        partOfSpeech: m.partOfSpeech,
        definitions: (m.definitions || []).slice(0, 3).map((d: any) => ({
          definition: d.definition || '',
          example: d.example,
        })),
      })),
    };
  } catch {
    return null;
  }
}

export function formatDefinition(entry: DictionaryEntry): string {
  const parts: string[] = [];
  parts.push(`${entry.word}${entry.phonetic ? ` (${entry.phonetic})` : ''}:`);
  for (const meaning of entry.meanings.slice(0, 2)) {
    if (meaning.partOfSpeech) parts.push(`As a ${meaning.partOfSpeech}:`);
    for (const def of meaning.definitions.slice(0, 2)) {
      parts.push(def.definition);
      if (def.example) parts.push(`For example: ${def.example}`);
    }
  }
  return parts.join(' ').trim();
}
