/**
 * Kevo joke capability using the free public JokeAPI (no key required).
 * Always uses safe-mode to avoid offensive content.
 * https://v2.jokeapi.dev/
 */

export interface JokeResult {
  text: string;
  category: string;
  id: number;
}

const JOKE_URL = 'https://v2.jokeapi.dev/joke/Any?safe-mode&type=single&blacklistFlags=nsfw,religious,political,racist,sexist,explicit';

export async function fetchSafeJoke(): Promise<JokeResult | null> {
  try {
    const res = await fetch(JOKE_URL);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error || !data.joke) return null;
    return {
      text: data.joke as string,
      category: (data.category as string) || 'Misc',
      id: (data.id as number) || 0,
    };
  } catch {
    return null;
  }
}

export function formatJokeReply(joke: JokeResult | null): string {
  if (!joke) return 'I could not get a joke right now. Try again in a moment.';
  return joke.text;
}
