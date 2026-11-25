/**
 * Automatic Chapter Markers Extractor for AnF Music Hub & ThingsBook
 * 
 * Parses video descriptions, podcast show-notes, and audiobook manifests
 * to extract timestamped track and reading chapters.
 * Inspired by iv-org/invidious metadata extraction.
 */

export interface TrackChapter {
  index: number;
  title: string;
  startSeconds: number;
  endSeconds?: number;
  timeLabel: string;
}

export const ChapterMarkersCore = {
  /**
   * Parse timestamp string (hh:mm:ss or mm:ss) into seconds.
   */
  parseTimestamp(timeStr: string): number {
    const parts = timeStr.trim().split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return 0;

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  },

  /**
   * Format seconds into mm:ss or hh:mm:ss.
   */
  formatSeconds(seconds: number): string {
    const s = Math.floor(seconds || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  },

  /**
   * Extract chapter markers from freeform text descriptions or show-notes.
   */
  extractChapters(text: string, totalDurationSeconds?: number): TrackChapter[] {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split(/\r?\n/);
    const timeRegex = /(?:^|\s)(?:(\d{1,2}:\d{2}:\d{2})|(\d{1,2}:\d{2}))(?:\s*[-–—:]\s*|\s+)(.+)$/;
    const rawChapters: Array<{ seconds: number; title: string }> = [];

    for (const line of lines) {
      const match = line.trim().match(timeRegex);
      if (match) {
        const timeStr = match[1] || match[2];
        const title = match[3].trim().replace(/^[-–—:]\s*/, '');
        const seconds = ChapterMarkersCore.parseTimestamp(timeStr);
        if (title) {
          rawChapters.push({ seconds, title });
        }
      }
    }

    // Sort by timestamp ascending
    rawChapters.sort((a, b) => a.seconds - b.seconds);

    // Build structured chapters with endSeconds
    const chapters: TrackChapter[] = [];
    for (let i = 0; i < rawChapters.length; i++) {
      const cur = rawChapters[i];
      const next = rawChapters[i + 1];
      const endSeconds = next ? next.seconds : totalDurationSeconds;

      chapters.push({
        index: i,
        title: cur.title,
        startSeconds: cur.seconds,
        endSeconds,
        timeLabel: ChapterMarkersCore.formatSeconds(cur.seconds),
      });
    }

    return chapters;
  }
};
