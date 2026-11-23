/**
 * A short joke from icanhazdadjoke.com (free, no key), for "tell me a joke". Always on, apart from the online lookups
 * switch: the owner turned it on for good on 22 Nov 2026. Only the request itself is sent, nothing the owner said.
 */

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

/**
 * One joke as plain text. Throws when the service does not answer within 2 seconds or sends no joke, so the local AI
 * can still start one inside Kevo's 5-second answer budget.
 */
export async function fetchJoke(fetchFn?: LookupFetch, timeoutMs = 2000): Promise<string> {
  const res = await onlineGet('https://icanhazdadjoke.com/', 'the joke service', fetchFn, { Accept: 'application/json' }, timeoutMs);
  if (!res.ok) throw new Error(`the joke service answered ${res.status}.`);
  const joke = String(((await res.json()) as { joke?: unknown }).joke ?? '').trim();
  if (!joke) throw new Error('the joke service sent no joke.');
  return joke;
}
