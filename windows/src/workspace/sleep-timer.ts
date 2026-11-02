// Pure logic for the "End of chapter" sleep timer (see docs/specs/sleep-end-of-chapter.md).
export type SleepChapter = { title?: string; start: number };

/** Stop this close before the point (seconds): a coarse timeupdate must not overshoot. */
export const SLEEP_STOP_TOLERANCE = 0.3;
/** A forward jump beyond the armed point by more than this is a seek, not playback. */
export const SLEEP_RESEEK_THRESHOLD = 1.5;

/** End of the chapter containing `position`: next chapter start, else the duration, else null. */
export function chapterEndAt(chapters: SleepChapter[] | undefined, position: number, duration: number): number | null {
  const starts = (chapters || []).map(c => c.start).filter(s => Number.isFinite(s) && s >= 0).sort((a, b) => a - b);
  if (!starts.length) return null;
  const next = starts.find(s => s > position);
  if (next !== undefined) return next;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

/** One timeupdate tick of an armed chapter timer: stop, keep the point, or re-arm after a forward seek. */
export function chapterSleepStep(at: number, chapters: SleepChapter[] | undefined, position: number, duration: number): { stop: boolean; at: number } {
  if (position < at - SLEEP_STOP_TOLERANCE) return { stop: false, at };
  if (position - at <= SLEEP_RESEEK_THRESHOLD) return { stop: true, at };
  const next = chapterEndAt(chapters, position, duration);
  return next === null ? { stop: true, at } : { stop: false, at: next };
}
