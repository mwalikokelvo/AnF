/**
 * 4D Spatiotemporal Journey Scrubber for AnF Reader & ThingsBook
 * 
 * Links reader progress (chapter index & scroll percentage) to dynamic
 * geographic route interpolation and chronological waypoint animation.
 * Inspired by bilawalsidhu/gods-eye-view + paperclipai/paperclip.
 */

import { type NarrativeWaypoint } from './spatial-atlas';

export interface ChapterSpatialSegment {
  chapterIndex: number;
  chapterTitle: string;
  waypoints: NarrativeWaypoint[];
}

export interface TimelineSpatialState {
  currentChapter: number;
  progressPct: number;
  activeLocation: string | null;
  currentCoord: [number, number] | null; // [lat, lng]
  visitedWaypoints: NarrativeWaypoint[];
  upcomingWaypoints: NarrativeWaypoint[];
  routeCoordinates: Array<[number, number]>; // [lng, lat] for GeoJSON
}

export const SpatiotemporalScrubber = {
  /**
   * Linear geographical interpolation between two coordinates.
   */
  interpolate(coordA: [number, number], coordB: [number, number], t: number): [number, number] {
    const lat = coordA[0] + (coordB[0] - coordA[0]) * Math.max(0, Math.min(1, t));
    const lng = coordA[1] + (coordB[1] - coordA[1]) * Math.max(0, Math.min(1, t));
    return [Number(lat.toFixed(4)), Number(lng.toFixed(4))];
  },

  /**
   * Calculate current spatiotemporal state given book chapters and reading scroll offset.
   */
  scrub(
    chapters: ChapterSpatialSegment[],
    activeChapterIndex: number,
    chapterProgressPct = 0.5
  ): TimelineSpatialState {
    const allWaypoints: NarrativeWaypoint[] = [];
    const chapterLookup = new Map<number, NarrativeWaypoint[]>();

    for (const c of chapters) {
      chapterLookup.set(c.chapterIndex, c.waypoints);
      allWaypoints.push(...c.waypoints);
    }

    if (allWaypoints.length === 0) {
      return {
        currentChapter: activeChapterIndex,
        progressPct: chapterProgressPct,
        activeLocation: null,
        currentCoord: null,
        visitedWaypoints: [],
        upcomingWaypoints: [],
        routeCoordinates: [],
      };
    }

    const currentChapterWaypoints = chapterLookup.get(activeChapterIndex) || [];
    const visited: NarrativeWaypoint[] = [];
    const upcoming: NarrativeWaypoint[] = [];

    for (const c of chapters) {
      if (c.chapterIndex < activeChapterIndex) {
        visited.push(...c.waypoints);
      } else if (c.chapterIndex > activeChapterIndex) {
        upcoming.push(...c.waypoints);
      } else {
        // Current chapter
        const count = c.waypoints.length;
        if (count > 0) {
          const splitIdx = Math.floor(chapterProgressPct * count);
          visited.push(...c.waypoints.slice(0, splitIdx + 1));
          upcoming.push(...c.waypoints.slice(splitIdx + 1));
        }
      }
    }

    // Determine current interpolated position
    let activeLocation = 'In Transit';
    let currentCoord: [number, number] = [allWaypoints[0].lat, allWaypoints[0].lng];

    if (visited.length > 0) {
      const last = visited[visited.length - 1];
      activeLocation = last.location;
      currentCoord = [last.lat, last.lng];

      if (upcoming.length > 0) {
        const next = upcoming[0];
        currentCoord = SpatiotemporalScrubber.interpolate(
          [last.lat, last.lng],
          [next.lat, next.lng],
          chapterProgressPct
        );
      }
    }

    const routeCoordinates = visited.map(w => [w.lng, w.lat] as [number, number]);
    if (upcoming.length > 0 && currentCoord) {
      routeCoordinates.push([currentCoord[1], currentCoord[0]]);
    }

    return {
      currentChapter: activeChapterIndex,
      progressPct: chapterProgressPct,
      activeLocation,
      currentCoord,
      visitedWaypoints: visited,
      upcomingWaypoints: upcoming,
      routeCoordinates,
    };
  }
};
