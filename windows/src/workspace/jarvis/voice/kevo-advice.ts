/**
 * Random advice for Kevo.
 * Uses the free adviceslip.com API when online lookups are allowed,
 * and falls back to a curated local list of positive tips.
 */

import { bareRequest } from './kevo-fun';
import { onlineGet, type LookupFetch } from './kevo-online';

export const LOCAL_ADVICE: readonly string[] = [
  'Take a short walk. Movement helps clear the mind.',
  'Write one thing you are grateful for today.',
  'Drink a glass of water. Small habits compound.',
  'Finish one small task before starting a new one.',
  'Smile. It can shift how the rest of the day feels.',
  'Be kind to yourself when things do not go as planned.',
  'Listen carefully before responding.',
];

/** "give me advice", "tell me some advice", "random advice", "what is your advice" */
export function isAdviceRequest(lower: string): boolean {
  const said = bareRequest(lower);
  return /^(?:(?:tell|give) me (?:some |a piece of )?advice|(?:random |some )?advice|what(?:'s| is) your advice|do you have any advice)$/.test(
    said
  );
}

export async function randomAdvice(
  online: boolean,
  fetchFn?: LookupFetch
): Promise<string> {
  if (!online) {
    return LOCAL_ADVICE[Math.floor(Math.random() * LOCAL_ADVICE.length)];
  }
  try {
    const res = await onlineGet('https://api.adviceslip.com/advice', 'Advice Slip', fetchFn);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as { slip?: { advice?: string } };
    const advice = data?.slip?.advice?.trim();
    if (advice) return advice;
  } catch {
    // Fall back to offline advice
  }
  return LOCAL_ADVICE[Math.floor(Math.random() * LOCAL_ADVICE.length)];
}
