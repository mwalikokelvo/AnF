/**
 * Kevo crypto price lookup via free CoinGecko public API (no key).
 */

import { onlineGet, type LookupFetch } from './kevo-online';

const COINGECKO = 'https://api.coingecko.com/api/v3/simple/price';

const KNOWN: Record<string, string> = {
  bitcoin: 'bitcoin', btc: 'bitcoin',
  ethereum: 'ethereum', eth: 'ethereum',
  solana: 'solana', sol: 'solana',
  cardano: 'cardano', ada: 'cardano',
  dogecoin: 'dogecoin', doge: 'dogecoin',
  ripple: 'ripple', xrp: 'ripple',
};

export function normalizeCoin(raw: string): string | null {
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return KNOWN[key] || null;
}

export async function getCryptoPrice(coin: string, fetchFn?: LookupFetch): Promise<string> {
  const id = normalizeCoin(coin);
  if (!id) return `I do not recognise "${coin}" as a major cryptocurrency, sir. Try Bitcoin, Ethereum or Solana.`;
  try {
    const url = `${COINGECKO}?ids=${id}&vs_currencies=usd&include_24hr_change=true`;
    const res = await onlineGet(url, 'CoinGecko', fetchFn);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json() as Record<string, { usd?: number; usd_24h_change?: number }>;
    const info = data[id];
    if (!info?.usd) return `No price data for ${id} right now, sir.`;
    const change = info.usd_24h_change != null
      ? ` (${info.usd_24h_change > 0 ? '+' : ''}${info.usd_24h_change.toFixed(1)}% in 24h)`
      : '';
    return `${id.charAt(0).toUpperCase() + id.slice(1)} is currently $${info.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}${change}, sir.`;
  } catch {
    return 'The price service did not answer. Check the internet connection, sir.';
  }
}

export function isCryptoRequest(lower: string): string | null {
  const m = /\b(?:price|value|cost|how much is|what's|whats) (?:of |the )?(bitcoin|btc|ethereum|eth|solana|sol|cardano|ada|dogecoin|doge|ripple|xrp)\b/i.exec(lower)
    || /\b(bitcoin|btc|ethereum|eth|solana|sol) (?:price|value)\b/i.exec(lower);
  return m ? m[1] : null;
}
