/** Kevo Translation: free open-source translation via LibreTranslate public instance.
 * Based on public API docs (POST /translate). No proprietary code.
 * Rate-limited public endpoint; self-host recommended for production.
 */

export interface TranslationResult {
  translatedText: string;
  source: string;
  target: string;
}

const DEFAULT_ENDPOINT = 'https://libretranslate.com/translate';

export async function translateText(
  text: string,
  targetLang: string = 'es',
  sourceLang: string = 'auto',
  endpoint = DEFAULT_ENDPOINT
): Promise<TranslationResult | null> {
  const q = text.trim();
  if (!q) return null;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, source: sourceLang, target: targetLang, format: 'text' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Translation service answered ${res.status}.`);
    const data = (await res.json()) as { translatedText?: string };
    if (!data.translatedText) return null;
    return { translatedText: data.translatedText, source: sourceLang, target: targetLang };
  } catch {
    return null;
  }
}

export function formatTranslation(result: TranslationResult): string {
  return `${result.translatedText}`;
}
