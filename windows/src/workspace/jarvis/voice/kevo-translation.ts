/**
 * Kevo Translation: free translation using MyMemory public API.
 * https://mymemory.translated.net/doc/spec.php
 * No key required for low volume.
 */

export async function translateText(text: string, fromLang: string, toLang: string): Promise<string> {
  if (!text.trim()) throw new Error('Empty text');
  const langpair = `${fromLang}|${toLang}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Translation API error: ${resp.status}`);
  const data = await resp.json();
  if (data.responseStatus !== 200) throw new Error(data.responseDetails || 'Translation failed');
  return data.responseData?.translatedText || text;
}

export function formatTranslation(original: string, translated: string, from: string, to: string): string {
  return `${original} in ${to} is: ${translated}`;
}
