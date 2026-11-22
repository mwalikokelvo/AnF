/**
 * Random advice for Kevo.
 * Uses the free adviceslip.com API (no key) when online lookups are allowed;
 * otherwise a short local list. Nothing proprietary is copied.
 * Inspired by common "fun" replies in Siri, Alexa and open assistants.
 */

const LOCAL_ADVICE = [
  'Take a short walk. Movement helps clear the mind.',
  'Write one thing you are grateful for today.',
  'Drink a glass of water. Small habits compound.',
  'Finish one small task before starting a new one.',
  'Smile. It can shift how the rest of the day feels.',
];

export async function randomAdvice(online: boolean): Promise<string> {
  if (!online) {
    return LOCAL_ADVICE[Math.floor(Math.random() * LOCAL_ADVICE.length)];
  }
  try {
    const res = await fetch('https://api.adviceslip.com/advice');
    if (!res.ok) throw new Error('status');
    const data = await res.json();
    return data.slip?.advice || LOCAL_ADVICE[0];
  } catch {
    return LOCAL_ADVICE[Math.floor(Math.random() * LOCAL_ADVICE.length)];
  }
}

export function isAdviceRequest(lower: string): boolean {
  return /^(?:(?:tell|give) me (?:some |a piece of )?advice|(?:random |some )?advice|what(?:'s| is) your advice)$/.test(lower.trim());
}
