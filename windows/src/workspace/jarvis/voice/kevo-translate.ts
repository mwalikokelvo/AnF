/**
 * English to another language with the free MyMemory service (no key), for "translate good morning to Swahili" while
 * online lookups are on. The phrase is sent to MyMemory. From Grok's translation branch, rebuilt here.
 */

import { onlineGet, type LookupFetch } from './kevo-online';
import { bareRequest } from './kevo-fun';

/** Spoken language names and their codes for MyMemory. */
export const LANGUAGES: Record<string, string> = {
  arabic: 'ar', chinese: 'zh-CN', mandarin: 'zh-CN', dutch: 'nl', english: 'en', french: 'fr', german: 'de', greek: 'el',
  hindi: 'hi', italian: 'it', japanese: 'ja', korean: 'ko', latin: 'la', polish: 'pl', portuguese: 'pt',
  russian: 'ru', somali: 'so', spanish: 'es', swahili: 'sw', kiswahili: 'sw', turkish: 'tr', ukrainian: 'uk', zulu: 'zu',
};

/** "translate good morning to Swahili", "translate thank you into French", "how do you say hello in Spanish". */
export function parseTranslateRequest(lower: string): { text: string; language: string; code: string } | null {
  const said = bareRequest(lower);
  const m = /^translate (.+?) (?:to|into) ([a-z]+)$/.exec(said) ?? /^how (?:do|would) (?:you|i) say (.+?) in ([a-z]+)$/.exec(said);
  if (!m) return null;
  const text = m[1].replace(/^["'“]|["'”]$/g, '').trim();
  const code = LANGUAGES[m[2]];
  if (!text || !code || code === 'en') return null;
  return { text, language: m[2][0].toUpperCase() + m[2].slice(1), code };
}

/** The translated text. Throws when the service does not answer or refuses. */
export async function translateFromEnglish(text: string, code: string, fetchFn?: LookupFetch): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`en|${code}`)}`;
  const res = await onlineGet(url, 'the translation service', fetchFn);
  if (!res.ok) throw new Error(`the translation service answered ${res.status}.`);
  const data = (await res.json()) as { responseStatus?: number | string; responseData?: { translatedText?: string } };
  const translated = data.responseData?.translatedText?.trim();
  if (Number(data.responseStatus) !== 200 || !translated) throw new Error('the translation service could not translate that.');
  return translated;
}
