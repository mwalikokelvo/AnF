/**
 * Free Spaced Repetition Scheduler (FSRS-4.5) for Book Study Cards
 * 
 * Provides an optimal spaced repetition scheduling engine for flashcards,
 * book highlights, and syntopical study notes, tracking memory stability,
 * item difficulty, and retrievability over time.
 * 
 * Ported from ThingsBook / inspired by open-spaced-repetition/fsrs.js.
 */

export type FsrsState = 'New' | 'Learning' | 'Review' | 'Relearning';
export type FsrsRating = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface FsrsCard {
  id: string;
  front: string;
  back: string;
  bookSource?: string;
  state: FsrsState;
  reps: number;
  lapses: number;
  stability: number;  // Memory stability in days
  difficulty: number; // 1.0 (easiest) to 10.0 (hardest)
  lastReview?: number;// Timestamp ms
  due: number;        // Due timestamp ms
}

export interface FsrsSchedulingResult {
  card: FsrsCard;
  nextIntervalDays: number;
  dueTimestamp: number;
}

export class FsrsScheduler {
  private requestRetention: number;

  constructor(requestRetention = 0.9) {
    this.requestRetention = requestRetention;
  }

  /**
   * Initializes a brand new study card
   */
  public createCard(front: string, back: string, bookSource?: string): FsrsCard {
    return {
      id: 'card_' + Math.random().toString(36).substring(2, 9),
      front,
      back,
      bookSource,
      state: 'New',
      reps: 0,
      lapses: 0,
      stability: 0.0,
      difficulty: 5.0,
      due: Date.now()
    };
  }

  /**
   * Calculates retrievability (probability of recall) given elapsed days $t$ and stability $S$
   */
  public computeRetrievability(card: FsrsCard, now = Date.now()): number {
    if (card.state === 'New' || !card.lastReview || card.stability <= 0) return 0.0;
    const elapsedDays = Math.max(0, (now - card.lastReview) / 86400000);
    // FSRS power-law forgetting curve: R = (1 + factor * t / S)^(-0.5)
    const factor = 19.0 / 81.0;
    const r = Math.pow(1 + factor * (elapsedDays / card.stability), -0.5);
    return Math.round(Math.max(0.0, Math.min(1.0, r)) * 100) / 100;
  }

  /**
   * Computes next review interval (in days) to maintain request retention
   */
  public nextInterval(stability: number): number {
    const factor = 19.0 / 81.0;
    const interval = (stability / factor) * (Math.pow(this.requestRetention, -2) - 1);
    return Math.max(1, Math.round(interval));
  }

  /**
   * Evaluates a review response (Again, Hard, Good, Easy) and returns updated card state
   */
  public reviewCard(card: FsrsCard, rating: FsrsRating, now = Date.now()): FsrsSchedulingResult {
    const updated = { ...card };
    updated.reps++;
    updated.lastReview = now;

    if (rating === 'Again') {
      updated.lapses++;
      updated.state = updated.state === 'New' ? 'Learning' : 'Relearning';
      updated.difficulty = Math.min(10.0, updated.difficulty + 0.5);
      updated.stability = Math.max(0.4, updated.stability * 0.4);
      const intervalDays = 1;
      updated.due = now + intervalDays * 86400000;
      return { card: updated, nextIntervalDays: intervalDays, dueTimestamp: updated.due };
    }

    if (card.state === 'New') {
      // First review
      if (rating === 'Hard') {
        updated.stability = 1.0;
        updated.difficulty = 6.0;
      } else if (rating === 'Good') {
        updated.stability = 3.0;
        updated.difficulty = 5.0;
      } else { // Easy
        updated.stability = 7.0;
        updated.difficulty = 4.0;
      }
      updated.state = 'Review';
    } else {
      // Existing review
      const retrievability = this.computeRetrievability(card, now);
      const diffMod = rating === 'Hard' ? +0.3 : (rating === 'Easy' ? -0.3 : 0.0);
      updated.difficulty = Math.max(1.0, Math.min(10.0, updated.difficulty + diffMod));

      // Stability update factor
      let stabilityFactor = 1.0;
      if (rating === 'Hard') stabilityFactor = 1.2;
      else if (rating === 'Good') stabilityFactor = 2.4;
      else if (rating === 'Easy') stabilityFactor = 3.8;

      updated.stability = Math.max(1.0, updated.stability * stabilityFactor * (1.0 + (1.0 - retrievability)));
      updated.state = 'Review';
    }

    const intervalDays = this.nextInterval(updated.stability);
    updated.due = now + intervalDays * 86400000;

    return {
      card: updated,
      nextIntervalDays: intervalDays,
      dueTimestamp: updated.due
    };
  }

  /**
   * Returns list of cards that are currently due for review
   */
  public getDueCards(cards: FsrsCard[], now = Date.now()): FsrsCard[] {
    return cards.filter(c => c.due <= now);
  }
}
