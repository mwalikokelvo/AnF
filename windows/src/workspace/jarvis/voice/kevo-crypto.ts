/**
 * Cryptocurrency price lookup for Kevo using the free CoinGecko API (no key required).
 * https://www.coingecko.com/en/api
 */

const COIN_MAP: Record<string, string> = {
  bitcoin: 'bitcoin',
  btc: 'bitcoin',
  ethereum: 'ethereum',
  eth: 'ethereum',
  solana: 'solana',
  sol: 'solana',
  dogecoin: 'dogecoin',
  doge: 'dogecoin',
  cardano: 'cardano',
  ada: 'cardano',
  ripple: 'ripple',
  xrp: 'ripple',
};

export async function getCryptoPrice(coin: string, currency = 'usd'): Promise<string> {
  const key = String(coin || '').trim().toLowerCase();
  if (!key) return 'Which coin would you like the price for, sir?';

  const id = COIN_MAP[key] || key;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${encodeURIComponent(currency)}&include_24hr_change=true`
    );
    if (!res.ok) throw new Error('Price fetch failed');
    const data = await res.json();
    const info = data[id];
    if (!info) return `I could not find a price for ${coin}, sir. Try bitcoin, ethereum or solana.`;

    const price = info[currency.toLowerCase()];
    const change = info[`${currency.toLowerCase()}_24h_change`];
    const changeText = change != null ? `, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)} percent in the last 24 hours` : '';

    return `${id.charAt(0).toUpperCase() + id.slice(1)} is currently ${price} ${currency.toUpperCase()}${changeText}, sir.`;
  } catch (err: any) {
    return `I could not fetch the price right now, sir. ${err?.message || ''}`.trim();
  }
}
