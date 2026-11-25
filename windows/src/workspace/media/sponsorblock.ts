export interface SponsorBlockSegment {
  category: string;
  startSec: number;
  endSec: number;
  actionType: string;
}

export interface SponsorCheckResult {
  shouldSkip: boolean;
  jumpToSec?: number;
  category?: string;
}

export class SponsorBlockEngine {
  private readonly segments: SponsorBlockSegment[];

  constructor(segments: SponsorBlockSegment[]) {
    this.segments = [...segments];
  }

  checkTimestamp(sec: number): SponsorCheckResult {
    for (const seg of this.segments) {
      if (seg.actionType === 'skip' && sec >= seg.startSec && sec < seg.endSec) {
        return {
          shouldSkip: true,
          jumpToSec: seg.endSec,
          category: seg.category,
        };
      }
    }
    return { shouldSkip: false };
  }

  getTotalTimeSavedSec(): number {
    return this.segments
      .filter((seg) => seg.actionType === 'skip' && seg.endSec > seg.startSec)
      .reduce((total, seg) => total + (seg.endSec - seg.startSec), 0);
  }
}
