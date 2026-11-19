/**
 * Kevo currency conversion using free Frankfurter API (https://frankfurter.dev).
 * No API key required. Rates from central banks.
 * Example: convert 100 USD to EUR.
 */

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
  usd: 'USD',
  euros: 'EUR',
  euro: 'EUR',
  eur: 'EUR',
  pounds: 'GBP',
  pound: 'GBP',
  gbp: 'GBP',
  yen: 'JPY',
  jpy: 'JPY',
  francs: 'CHF',
  franc: 'CHF',
  chf: 'CHF',
};

export function parseCurrencyRequest(text: string): { amount: number; from: string; to: string } | null {
  const lower = text.toLowerCase().replace(/[.!?]+$/, '').trim();
  // "convert 100 usd to eur", "how much is 50 pounds in dollars", "100 dollars to euros"
  const m = /(?:convert|how much is|what's|whats)\s+(\d+(?:\.\d+)?)\s+([a-z]+)\s+(?:to|in|into)\s+([a-z]+)/.exec(lower)
    || /^(\d+(?:\.\d+)?)\s+([a-z]+)\s+(?:to|in)\s+([a-z]+)$/.exec(lower);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  const from = CURRENCY_ALIASES[m[2]] || m[2].toUpperCase();
  const to = CURRENCY_ALIASES[m[3]] || m[3].toUpperCase();
  if (from === to || amount <= 0) return null;
  return { amount, from, to };
}

export async function convertCurrency(amount: number, from: string, to: string): Promise<CurrencyConversion | null> {
  try {
    const url = `https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (typeof data.rate !== 'number') return null;
    return {
      amount,
      from: data.base || from,
      to: data.quote || to,
      result: Math.round(amount * data.rate * 100) / 100,
      date: data.date,
    };
  } catch {
    return null;
  }
}

export function formatConversion(conv: CurrencyConversion): string {
  return `${conv.amount} ${conv.from} is about ${conv.result} ${conv.to}${conv.date ? ` (as of ${conv.date})` : ''}.`;
}
