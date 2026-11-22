/** The quote of the day from ZenQuotes (free, no key), for "quote of the day" while online lookups are on. From Grok. */

import { onlineGet, type LookupFetch } from './kevo-online';
import { bareRequest } from './kevo-fun';

/** "quote of the day", "daily quote", "give me a quote", "inspire me". */
export function isQuoteRequest(lower: string): boolean {
  return /^(?:(?:give me|tell me|read me|what'?s|what is) )?(?:a |the |today'?s )?(?:daily |inspiring |inspirational )?quote(?: of the day| for today)?$|^inspire me$/.test(bareRequest(lower));
}

/** "Today's quote, from Maya Angelou: …". Throws when the service does not answer or sends no quote. */
export async function fetchQuote(fetchFn?: LookupFetch): Promise<string> {
  const res = await onlineGet('https://zenquotes.io/api/today', 'the quote service', fetchFn);
  if (!res.ok) throw new Error(`the quote service answered ${res.status}.`);
  const data = (await res.json()) as { q?: string; a?: string }[];
  const text = data?.[0]?.q?.trim();
  const author = data?.[0]?.a?.trim();
  if (!text) throw new Error('the quote service sent no quote.');
  return author && author.toLowerCase() !== 'unknown' ? `Today's quote, from ${author}: ${text}` : `Today's quote: ${text}`;
}
