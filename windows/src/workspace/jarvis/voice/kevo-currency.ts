/**
 * Kevo currency conversion using free Frankfurter API (https://frankfurter.dev).
 * No API key required. Rates from central banks.
 * Example: convert 100 USD to EUR.
 */

import type { LookupFetch } from './kevo-online';
import { onlineGet } from './kevo-online';

export interface CurrencyConversion {
  amount: number;
  from: string;
  to: string;
  result: number;
  date?: string;
}

const CURRENCY_ALIASES: Record<string, string> = {
  dollars: 'USD',
  dollar: 'USD',
  euros: 'EUR',
  euro: 'EUR',
  pounds: 'GBP',
  pound: 'GBP',
  yen: 'JPY',
  francs: 'CHF',
  franc: 'CHF',
  shillings: 'KES',
  shilling: 'KES',
};

/** "dollars", "usd" or "Kenyan shillings" to an ISO code, or null when it is not a currency word or code. */
export function currencyCode(word: string): string | null {
  const lower = word.toLowerCase().trim().replace(/^(?:us|american|kenyan|british|swiss|japanese)\s+/, '');
  if (Object.hasOwn(CURRENCY_ALIASES, lower)) return CURRENCY_ALIASES[lower];
  return /^[a-z]{3}$/.test(lower) ? lower.toUpperCase() : null;
}

/** Today's rate from Frankfurter times the amount, or null when Frankfurter has no rate for the pair. */
export async function convertCurrency(amount: number, from: string, to: string, fetchFn?: LookupFetch): Promise<CurrencyConversion | null> {
  const res = await onlineGet(`https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}`, 'the currency service', fetchFn);
  if (res.status === 404 || res.status === 422) return null;
  if (!res.ok) throw new Error(`the currency service answered ${res.status}.`);
  const data = (await res.json()) as { rate?: number; base?: string; quote?: string; date?: string };
  if (typeof data.rate !== 'number') return null;
  return {
    amount,
    from: data.base || from,
    to: data.quote || to,
    result: Math.round(amount * data.rate * 100) / 100,
    date: data.date,
  };
}

export function formatConversion(conv: CurrencyConversion): string {
  return `${conv.amount} ${conv.from} is about ${conv.result} ${conv.to}${conv.date ? ` (as of ${conv.date})` : ''}.`;
}
