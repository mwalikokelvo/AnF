/** A short daily quote from a free public service (zenquotes.io style), for "quote of the day" while online lookups are on. */

import { onlineGet, type LookupFetch } from './kevo-online';

/** "quote of the day", "daily quote", "inspire me", with or without "please" or "kevo". */
export function isQuoteRequest(lower: string): boolean {
  const said = lower
    .replace(/[.!?]+$/, '')
    .trim()
    .replace(/^kevo[\s,]+/, '')
    .replace(/^(?:(?:can|could|would|will) you(?: please)?|please)[\s,]+/, '')
    .replace(/[\s,]+(?:please|kevo)$/, '');
  return /^(?:(?:give me |tell me )?(?:a |the )?(?:daily )?quote(?: of the day)?|inspire me|quote of the day)$/.test(said);
}

/** One quote as plain text. Throws when the service does not answer. */
export async function fetchQuote(fetchFn?: LookupFetch): Promise<string> {
  // Free, no-key endpoint that returns an array of quotes.
  const res = await onlineGet('https://zenquotes.io/api/today', 'the quote service', fetchFn);
  if (!res.ok) throw new Error(`the quote service answered ${res.status}.`);
  const data = (await res.json()) as { q?: string; a?: string }[];
  const item = data?.[0];
  const text = item?.q?.trim();
  const author = item?.a?.trim();
  if (!text) throw new Error('the quote service sent no quote.');
  return author ? `${text} — ${author}` : text;
}
