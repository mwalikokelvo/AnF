/** A short joke from icanhazdadjoke.com (free, no key), for "tell me a joke" while online lookups are on. */

import { onlineGet, type LookupFetch } from './kevo-online';

/** "Tell me a joke", "joke", "make me laugh", "say something funny", with or without "please" or "kevo". */
export function isJokeRequest(lower: string): boolean {
  const said = lower
    .replace(/[.!?]+$/, '')
    .trim()
    .replace(/^kevo[\s,]+/, '')
    .replace(/^(?:(?:can|could|would|will) you(?: please)?|please)[\s,]+/, '')
    .replace(/[\s,]+(?:please|kevo)$/, '');
  return /^(?:tell me (?:a|another) joke|(?:a |another )?joke|make me laugh|say something funny)$/.test(said);
}

/** One joke as plain text. Throws when the service does not answer or sends no joke. */
export async function fetchJoke(fetchFn?: LookupFetch): Promise<string> {
  const res = await onlineGet('https://icanhazdadjoke.com/', 'the joke service', fetchFn, { Accept: 'application/json' });
  if (!res.ok) throw new Error(`the joke service answered ${res.status}.`);
  const joke = String(((await res.json()) as { joke?: unknown }).joke ?? '').trim();
  if (!joke) throw new Error('the joke service sent no joke.');
  return joke;
}
