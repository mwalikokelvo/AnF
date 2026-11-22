/**
 * A short random quote from api.quotable.io (free, no key), for "tell me a quote" or "quote of the day".
 * Always on, apart from the online lookups switch. Only the request itself is sent.
 */

import { onlineGet, type LookupFetch } from './kevo-online';

/** Matches "tell me a quote", "quote", "quote of the day", "inspire me", with or without please/kevo. */
export function isQuoteRequest(lower: string): boolean {
  const said = lower
    .replace(/[.!?]+$/, '')
    .trim()
    .replace(/^kevo[\s,]+/, '')
    .replace(/^(?:(?:can|could|would|will) you(?: please)?|please)[\s,]+/, '')
    .replace(/[\s,]+(?:please|kevo)$/, '');
  return /^(?:tell me (?:a|another) quote|(?:a |another )?quote|quote of the day|inspire me|say a quote)$/.test(said);
}

/**
 * One quote as plain text. Throws on failure so the local AI can fall back.
 */
export async function fetchQuote(fetchFn?: LookupFetch, timeoutMs = 2000): Promise<string> {
  const res = await onlineGet('https://api.quotable.io/random', 'the quote service', fetchFn, { Accept: 'application/json' }, timeoutMs);
  if (!res.ok) throw new Error(`the quote service answered ${res.status}.`);
  const data = (await res.json()) as { content?: string; author?: string };
  const content = String(data.content ?? '').trim();
  const author = String(data.author ?? '').trim();
  if (!content) throw new Error('the quote service sent no quote.');
  return author ? `${content} — ${author}` : content;
}
