/**
 * Offline spelling assistant and NATO phonetic alphabet helper for Kevo.
 * Matches capabilities from Siri, Alexa, and open-source assistants like Mycroft.
 * Zero external dependencies.
 */

import { bareRequest } from './kevo-fun';

export const NATO_PHONETIC: Record<string, string> = {
  a: 'Alfa',
  b: 'Bravo',
  c: 'Charlie',
  d: 'Delta',
  e: 'Echo',
  f: 'Foxtrot',
  g: 'Golf',
  h: 'Hotel',
  i: 'India',
  j: 'Juliett',
  k: 'Kilo',
  l: 'Lima',
  m: 'Mike',
  n: 'November',
  o: 'Oscar',
  p: 'Papa',
  q: 'Quebec',
  r: 'Romeo',
  s: 'Sierra',
  t: 'Tango',
  u: 'Uniform',
  v: 'Victor',
  w: 'Whiskey',
  x: 'X-ray',
  y: 'Yankee',
  z: 'Zulu',
  '0': 'Zero',
  '1': 'One',
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
};

export interface SpellingResult {
  word: string;
  spelling: string;
  speech: string;
}

export interface PhoneticResult {
  word: string;
  phonetic: string;
  speech: string;
}

/**
 * Spells out a word with capitalized hyphenated letters (e.g. "B-E-A-U-T-I-F-U-L").
 */
export function spellWord(word: string): SpellingResult {
  const clean = word.trim().replace(/^["']|["']$/g, '');
  const letters = Array.from(clean).map((c) => c.toUpperCase());
  const spelling = letters.join('-');
  return {
    word: clean,
    spelling,
    speech: `${clean} is spelled ${letters.join(', ')}.`,
  };
}

/**
 * Translates a word into NATO phonetic alphabet words.
 */
export function phoneticSpelling(word: string): PhoneticResult {
  const clean = word.trim().replace(/^["']|["']$/g, '').toLowerCase();
  const phoneticWords: string[] = [];
  for (const char of clean) {
    if (NATO_PHONETIC[char]) {
      phoneticWords.push(NATO_PHONETIC[char]);
    } else if (/[a-z0-9]/.test(char)) {
      phoneticWords.push(char.toUpperCase());
    }
  }
  const phonetic = phoneticWords.join(' ');
  return {
    word: clean,
    phonetic,
    speech: `${clean} in phonetic alphabet: ${phoneticWords.join(', ')}.`,
  };
}

/**
 * Detects requests like "how do you spell conscientious", "spell elephant",
 * or "phonetic spelling of bravo", "spell target in nato".
 */
export function parseSpellingRequest(lower: string): { word: string; phonetic: boolean } | null {
  const said = bareRequest(lower).toLowerCase();
  const phoneticMatch = /^(?:what is the )?phonetic (?:spelling|alphabet) (?:of|for) ([a-z0-9]+)$/.exec(said)
    || /^(?:spell|say) ([a-z0-9]+) in (?:nato|phonetic)(?: alphabet)?$/.exec(said);
  if (phoneticMatch) {
    return { word: phoneticMatch[1].trim(), phonetic: true };
  }

  const spellMatch = /^(?:how do you |how to )?spell ([a-z0-9]+)$/.exec(said)
    || /^spelling of ([a-z0-9]+)$/.exec(said);
  if (spellMatch) {
    return { word: spellMatch[1].trim(), phonetic: false };
  }

  return null;
}
