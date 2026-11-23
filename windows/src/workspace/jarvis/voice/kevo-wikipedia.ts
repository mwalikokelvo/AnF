/** A short Wikipedia summary of a topic, from the free REST API (https://en.wikipedia.org/api/rest_v1/). */

import { onlineGet, type LookupFetch } from './kevo-online';

export interface WikipediaSummary {
  title: string;
  summary: string;
}

/** The page's opening summary, cut to about two spoken sentences, or null when Wikipedia has no such page. */
export async function wikipediaSummary(topic: string, fetchFn?: LookupFetch): Promise<WikipediaSummary | null> {
  const title = topic.trim().replace(/\s+/g, '_');
  if (!title) return null;
  const res = await onlineGet(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`, 'Wikipedia', fetchFn);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia answered ${res.status}.`);
  const data = (await res.json()) as { type?: string; title?: string; extract?: string; description?: string };
  const text = (data.extract || data.description || '').trim();
  if (!text) return null;
  // A disambiguation page lists meanings, which reads badly aloud.
  if (data.type === 'disambiguation') return { title: data.title || topic, summary: `${data.title || topic} has several meanings on Wikipedia. Say which one you mean.` };
  return { title: data.title || topic, summary: speakable(text) };
}

/** The first two sentences, at most about 400 characters. */
function speakable(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [text];
  let out = '';
  for (const s of sentences.slice(0, 2)) {
    if (out && (out + s).length > 400) break;
    out += s;
  }
  out = out.trim() || text;
  return out.length > 420 ? `${out.slice(0, 400).replace(/\s+\S*$/, '')}…` : out;
}
