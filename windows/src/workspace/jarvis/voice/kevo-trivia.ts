/**
 * A multiple-choice trivia question from the Open Trivia Database (free, no key), for "ask me a trivia question"
 * while online lookups are on. Kevo asks, then the next reply is the answer. From Grok.
 * Open Trivia DB's questions are licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), so Kevo
 * names the source in every question it asks.
 */

import { onlineGet, type LookupFetch } from './kevo-online';
import { bareRequest } from './kevo-fun';

export interface TriviaQuestion {
  category: string;
  question: string;
  choices: string[];
  answer: string;
}

/** "trivia", "ask me a trivia question", "quiz me", "give me a quiz question". */
export function isTriviaRequest(lower: string): boolean {
  return /^(?:(?:let'?s )?(?:play )?trivia|quiz me|(?:ask|give|tell) me (?:a|another) (?:trivia|quiz) question|(?:a |another )?trivia question|(?:a |another )?quiz question)$/.test(bareRequest(lower));
}

const LETTERS = ['A', 'B', 'C', 'D'];

/** Lower case without accents or punctuation, so a spoken "Pokemon" matches the choice "Pokémon". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();

export async function fetchTrivia(fetchFn?: LookupFetch, random: () => number = Math.random): Promise<TriviaQuestion> {
  const res = await onlineGet('https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986', 'the trivia service', fetchFn);
  if (!res.ok) throw new Error(`the trivia service answered ${res.status}.`);
  const data = (await res.json()) as { response_code?: number; results?: { category: string; question: string; correct_answer: string; incorrect_answers: string[] }[] };
  const item = data.response_code === 0 ? data.results?.[0] : undefined;
  if (!item) throw new Error('the trivia service sent no question.');
  const decode = (s: string) => decodeURIComponent(s).trim();
  const answer = decode(item.correct_answer);
  const choices = [answer, ...item.incorrect_answers.map(decode)];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { category: decode(item.category), question: decode(item.question), choices, answer };
}

/** "A Geography question from Open Trivia DB: … Is it A, Paris; B, Rome; C, Madrid; or D, Lisbon?" */
export function askTrivia(q: TriviaQuestion): string {
  const options = q.choices.map((c, i) => `${LETTERS[i]}, ${c}`);
  return `A ${q.category} question from Open Trivia DB: ${q.question} Is it ${options.slice(0, -1).join('; ')}; or ${options[options.length - 1]}?`;
}

/**
 * The reply to an answer, or null when `said` is not an answer to the question (then Kevo treats it as a new request).
 * An answer is a letter ("B", "it's B"), a choice's words, or giving up ("I don't know", "tell me").
 */
export function answerTrivia(q: TriviaQuestion, said: string): string | null {
  const bare = bareRequest(said.toLowerCase()).replace(/^(?:(?:i think )?(?:it'?s|it is|is it|the answer is|answer|my answer is|i'?ll (?:say|go with)) )/, '').trim();
  const reveal = `The answer is ${LETTERS[q.choices.indexOf(q.answer)]}, ${q.answer}.`;
  if (/^(?:i (?:don'?t|do not) know|no idea|tell me|what'?s the answer|what is the answer|i give up|give up|pass|skip)$/.test(bare)) return reveal;
  const letter = /^(?:letter )?([abcd])$/.exec(bare)?.[1];
  const picked = letter ? q.choices[LETTERS.indexOf(letter.toUpperCase())] : q.choices.find((c) => c.toLowerCase() === bare || (bare.length >= 3 && fold(c) === fold(bare)));
  if (!picked) return null;
  return picked === q.answer ? `That's right! It's ${q.answer}.` : `Not quite. ${reveal}`;
}
