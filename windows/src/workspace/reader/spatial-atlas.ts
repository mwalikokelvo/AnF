/**
 * Spatial Narrative Atlas for AnF Reader
 * 
 * Extracts geographical references and spatial stops from literature,
 * travelogues, and historical books to generate interactive story maps
 * and route waypoints.
 * Ported from ThingsBook / inspired by bilawalsidhu/gods-eye-view.
 */

export interface LocationCoordinate {
  lat: number;
  lng: number;
  label: string;
}

export interface NarrativeWaypoint {
  chapter: string;
  location: string;
  lat: number;
  lng: number;
  excerpt: string;
}

export interface GeoJsonPointFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    location: string;
    chapter: string;
    excerpt: string;
  };
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonPointFeature[];
}

export const KNOWN_LOCATIONS: Record<string, LocationCoordinate> = {
  'london': { lat: 51.5074, lng: -0.1278, label: 'London' },
  'paris': { lat: 48.8566, lng: 2.3522, label: 'Paris' },
  'rome': { lat: 41.9028, lng: 12.4964, label: 'Rome' },
  'athens': { lat: 37.9838, lng: 23.7275, label: 'Athens' },
  'cairo': { lat: 30.0444, lng: 31.2357, label: 'Cairo' },
  'alexandria': { lat: 31.2001, lng: 29.9187, label: 'Alexandria' },
  'tokyo': { lat: 35.6762, lng: 139.6503, label: 'Tokyo' },
  'new york': { lat: 40.7128, lng: -74.0060, label: 'New York' },
  'boston': { lat: 42.3601, lng: -71.0589, label: 'Boston' },
  'san francisco': { lat: 37.7749, lng: -122.4194, label: 'San Francisco' },
  'oxford': { lat: 51.7520, lng: -1.2577, label: 'Oxford' },
  'cambridge': { lat: 52.2053, lng: 0.1218, label: 'Cambridge' },
  'venice': { lat: 45.4408, lng: 12.3155, label: 'Venice' },
  'florence': { lat: 43.7696, lng: 11.2558, label: 'Florence' },
  'berlin': { lat: 52.5200, lng: 13.4050, label: 'Berlin' },
  'vienna': { lat: 48.2082, lng: 16.3738, label: 'Vienna' },
  'kyoto': { lat: 35.0116, lng: 135.7681, label: 'Kyoto' },
  'jerusalem': { lat: 31.7683, lng: 35.2137, label: 'Jerusalem' },
  'constantinople': { lat: 41.0082, lng: 28.9784, label: 'Constantinople / Istanbul' },
  'istanbul': { lat: 41.0082, lng: 28.9784, label: 'Istanbul' },
};

export const SpatialAtlasCore = {
  extractNarrativeWaypoints(chapterTitle: string, text: string): NarrativeWaypoint[] {
    if (!text || typeof text !== 'string') return [];
    const waypoints: NarrativeWaypoint[] = [];
    const lower = text.toLowerCase();
    const seen = new Set<string>();

    for (const [key, coords] of Object.entries(KNOWN_LOCATIONS)) {
      const idx = lower.indexOf(key);
      if (idx !== -1 && !seen.has(key)) {
        seen.add(key);
        const start = Math.max(0, text.lastIndexOf('.', idx) + 1);
        let end = text.indexOf('.', idx);
        if (end === -1) end = text.length;
        const excerpt = text.slice(start, end).trim();

        waypoints.push({
          chapter: chapterTitle || 'Chapter',
          location: coords.label,
          lat: coords.lat,
          lng: coords.lng,
          excerpt,
        });
      }
    }

    return waypoints;
  },

  toGeoJson(waypoints: NarrativeWaypoint[]): GeoJsonFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: (waypoints || []).map(wp => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [wp.lng, wp.lat],
        },
        properties: {
          location: wp.location,
          chapter: wp.chapter,
          excerpt: wp.excerpt,
        },
      })),
    };
  }
};
