/**
 * Currency conversion for Kevo using the free Frankfurter API (no key, ECB rates).
 * https://www.frankfurter.app/
 */

export async function convertCurrency(amount: number, from: string, to: string, fetchFn = fetch): Promise<number | null> {
  const url = `https://api.frankfurter.app/latest?amount=${amount}&from=${from.toUpperCase()}&to=${to.toUpperCase()}`;
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.rates?.[to.toUpperCase()] ?? null;
  } catch {
    return null;
  }
}

/** "convert 100 usd to eur", "how much is 50 pounds in dollars". */
export function parseCurrencyRequest(lower: string): { amount: number; from: string; to: string } | null {
  const m = /(?:convert|how much is|what is)?\s*([\d.]+)\s+([a-z]{3})\s+(?:to|in)\s+([a-z]{3})/.exec(lower);
  if (!m) return null;
  return { amount: Number(m[1]), from: m[2], to: m[3] };
}
