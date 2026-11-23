/**
 * Offline Terrain Elevation Profiles & Historical Chrono-Lens
 * 
 * Provides self-contained topographic elevation cross-sections along routes
 * and chronological era filtering for historical journeys without external GIS servers.
 * 
 * Inspired by bilawalsidhu/gods-eye-view 3D spatial & temporal intelligence.
 */

export interface ElevationPoint {
  distanceKm: number;
  elevationMeters: number;
  lat: number;
  lng: number;
  terrainType: 'maritime' | 'lowland' | 'plateau' | 'mountain';
}

export type HistoricalEra = 'antiquity' | 'medieval' | 'early_modern' | 'modern' | 'contemporary';

export interface ChronoWaypoint {
  id: string;
  location: string;
  lat: number;
  lng: number;
  year: number;
  era: HistoricalEra;
  description: string;
}

export interface ElevationSummary {
  profile: ElevationPoint[];
  maxElevationMeters: number;
  minElevationMeters: number;
  totalElevationGainMeters: number;
  terrainDifficulty: 'gentle' | 'moderate' | 'arduous' | 'extreme';
}

/**
 * Major mountain range bounding boxes [minLat, maxLat, minLng, maxLng, baseElevationMeters]
 */
const ELEVATION_REGIONS: Array<{
  name: string;
  box: [number, number, number, number];
  baseElevation: number;
  maxElevation: number;
}> = [
  { name: 'Himalayas / Tibetan Plateau', box: [26, 38, 70, 102], baseElevation: 4500, maxElevation: 8200 },
  { name: 'Alps', box: [44, 48, 5, 16], baseElevation: 2200, maxElevation: 4800 },
  { name: 'Andes', box: [-55, 10, -78, -62], baseElevation: 3500, maxElevation: 6900 },
  { name: 'Rockies', box: [32, 60, -125, -105], baseElevation: 2400, maxElevation: 4400 },
  { name: 'Pyrenees', box: [42, 43.5, -2, 3.5], baseElevation: 1800, maxElevation: 3400 },
  { name: 'Zagros / Iranian Plateau', box: [28, 38, 45, 60], baseElevation: 1800, maxElevation: 4000 }
];

export class ElevationChronoLens {
  /**
   * Classifies a calendar year into a historical era
   */
  public static classifyEra(year: number): HistoricalEra {
    if (year < 500) return 'antiquity';
    if (year < 1500) return 'medieval';
    if (year < 1800) return 'early_modern';
    if (year < 1945) return 'modern';
    return 'contemporary';
  }

  /**
   * Filters an array of waypoints by historical era
   */
  public filterByEra(waypoints: ChronoWaypoint[], targetEra: HistoricalEra): ChronoWaypoint[] {
    return waypoints.filter(w => w.era === targetEra);
  }

  /**
   * Approximates topographic elevation at a geographic coordinate without network tiles
   */
  public estimateElevation(lat: number, lng: number): { elevation: number; terrain: ElevationPoint['terrainType'] } {
    for (const region of ELEVATION_REGIONS) {
      const [minLat, maxLat, minLng, maxLng] = region.box;
      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
        // Pseudo-random deterministic topography variance
        const hash = Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453;
        const normalized = hash - Math.floor(hash);
        const elevation = Math.round(region.baseElevation + normalized * (region.maxElevation - region.baseElevation));
        return { elevation, terrain: 'mountain' };
      }
    }

    // Default terrestrial lowland vs sea
    const isSea = (lat > -60 && lat < 60 && ((lng > -160 && lng < -120) || (lng > -45 && lng < -20) || (lng > 60 && lng < 85 && lat < 10)));
    if (isSea) {
      return { elevation: 0, terrain: 'maritime' };
    }

    // Continental lowlands
    const hash = Math.sin(lat * 3.14 + lng * 1.59);
    const elevation = Math.max(10, Math.round(150 + (hash * 120)));
    return { elevation, terrain: 'lowland' };
  }

  /**
   * Computes elevation profile across multiple journey waypoints
   */
  public generateRouteElevationProfile(
    waypoints: Array<{ lat: number; lng: number }>,
    sampleCount = 20
  ): ElevationSummary {
    if (waypoints.length < 2) {
      return {
        profile: [],
        maxElevationMeters: 0,
        minElevationMeters: 0,
        totalElevationGainMeters: 0,
        terrainDifficulty: 'gentle'
      };
    }

    const profile: ElevationPoint[] = [];
    let accumulatedDistanceKm = 0;
    let totalGain = 0;
    let maxElev = 0;
    let minElev = 99999;

    // Approximate total distance
    const totalLegs = waypoints.length - 1;
    const samplesPerLeg = Math.max(2, Math.floor(sampleCount / totalLegs));

    for (let leg = 0; leg < totalLegs; leg++) {
      const p1 = waypoints[leg];
      const p2 = waypoints[leg + 1];

      for (let s = 0; s <= samplesPerLeg; s++) {
        if (leg > 0 && s === 0) continue; // avoid duplicate seam
        const frac = s / samplesPerLeg;
        const lat = p1.lat + (p2.lat - p1.lat) * frac;
        const lng = p1.lng + (p2.lng - p1.lng) * frac;

        // Step distance approximation (~111 km per degree lat)
        const dLat = (p2.lat - p1.lat) / samplesPerLeg;
        const dLng = (p2.lng - p1.lng) / samplesPerLeg;
        const stepDist = Math.sqrt((dLat * 111) ** 2 + (dLng * 111 * Math.cos(lat * Math.PI / 180)) ** 2);
        accumulatedDistanceKm += stepDist;

        const est = this.estimateElevation(lat, lng);
        if (profile.length > 0) {
          const prevElev = profile[profile.length - 1].elevationMeters;
          if (est.elevation > prevElev) {
            totalGain += (est.elevation - prevElev);
          }
        }

        maxElev = Math.max(maxElev, est.elevation);
        minElev = Math.min(minElev, est.elevation);

        profile.push({
          distanceKm: Math.round(accumulatedDistanceKm * 10) / 10,
          elevationMeters: est.elevation,
          lat: Math.round(lat * 1000) / 1000,
          lng: Math.round(lng * 1000) / 1000,
          terrainType: est.terrain
        });
      }
    }

    let difficulty: ElevationSummary['terrainDifficulty'] = 'gentle';
    if (totalGain > 6000 || maxElev > 5000) difficulty = 'extreme';
    else if (totalGain > 3000 || maxElev > 2500) difficulty = 'arduous';
    else if (totalGain > 1000) difficulty = 'moderate';

    return {
      profile,
      maxElevationMeters: maxElev,
      minElevationMeters: minElev === 99999 ? 0 : minElev,
      totalElevationGainMeters: Math.round(totalGain),
      terrainDifficulty: difficulty
    };
  }
}
