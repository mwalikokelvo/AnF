/**
 * Enhanced Free Dictionary for Kevo.
 * Uses https://api.dictionaryapi.dev (no key, free, public).
 * Complements existing kevo-dictionary.ts with phonetics, examples, synonyms.
 */

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[];
  speech: string;
}

export async function lookupFreeDictionary(word: string): Promise<DictionaryEntry | null> {
  if (!word?.trim()) return null;
  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim().toLowerCase())}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data[0]) return null;
    const entry = data[0];
    const phonetic = entry.phonetic || entry.phonetics?.[0]?.text;
    const meanings = (entry.meanings || []).slice(0, 3).map((m: any) => ({
      partOfSpeech: m.partOfSpeech,
      definitions: (m.definitions || []).slice(0, 2).map((d: any) => ({
        definition: d.definition,
        example: d.example,
      })),
    }));

    let speech = `${word}: `;
    if (phonetic) speech += `${phonetic}. `;
    if (meanings[0]) {
      speech += `${meanings[0].partOfSpeech}. ${meanings[0].definitions[0]?.definition || ''}`;
      if (meanings[0].definitions[0]?.example) speech += ` For example: ${meanings[0].definitions[0].example}`;
    }
    speech += '.';

    return { word: entry.word, phonetic, meanings, speech };
  } catch {
    return null;
  }
}
