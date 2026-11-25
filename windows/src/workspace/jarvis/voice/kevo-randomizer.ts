/**
 * Offline coin flip and number picker for Kevo.
 * Matches capabilities found in Google Assistant, Siri, and Alexa.
 * Zero external dependencies.
 */

import { bareRequest } from './kevo-fun';

export type CoinOutcome = 'heads' | 'tails';

export interface CoinFlipResult {
  outcome: CoinOutcome;
  speech: string;
}

export interface NumberPickResult {
  value: number;
  min: number;
  max: number;
  speech: string;
}

/** "flip a coin", "heads or tails", "toss a coin", "flip coin". */
export function isCoinFlipRequest(lower: string): boolean {
  const said = bareRequest(lower).toLowerCase();
  return /^(?:flip (?:a |the )?coin|heads or tails|toss (?:a |the )?coin|coin flip|coin toss)$/.test(said);
}

/** Simulates a coin flip. */
export function flipCoin(random: () => number = Math.random): CoinFlipResult {
  const outcome: CoinOutcome = random() < 0.5 ? 'heads' : 'tails';
  return {
    outcome,
    speech: `I flipped a coin and got ${outcome}, sir.`,
  };
}

/**
 * "pick a number between 1 and 10", "pick a number from 5 to 50", "random number between 1 and 100".
 */
export function parseNumberPickRequest(lower: string): { min: number; max: number } | null {
  const said = bareRequest(lower).toLowerCase();
  const m = /^(?:pick|choose|give me|generate)(?: a)? (?:random )?number (?:between|from) (\d+) (?:and|to) (\d+)$/.exec(said)
    || /^(?:random )?number (?:between|from) (\d+) (?:and|to) (\d+)$/.exec(said);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/** Picks a random integer between min and max inclusive. */
export function pickNumber(min: number, max: number, random: () => number = Math.random): NumberPickResult {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const value = Math.floor(random() * (high - low + 1)) + low;
  return {
    value,
    min: low,
    max: high,
    speech: `I picked ${value}.`,
  };
}
