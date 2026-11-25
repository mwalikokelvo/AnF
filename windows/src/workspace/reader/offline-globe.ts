/**
 * Air-Gapped Offline Globe & Transit Velocity Engine
 * 
 * Provides self-contained spherical and equirectangular coordinate projection,
 * great-circle routing, chronological waypoint interpolation, and historical transit
 * velocity modeling without any external map tiles, network connections, or WebGL dependencies.
 * 
 * Inspired by bilawalsidhu/gods-eye-view offline spatial rendering.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  visible: boolean;
}

export type TransportMode = 'foot' | 'horse' | 'sailing_ship' | 'steam_train' | 'flight';

export interface TransitEstimate {
  distanceKm: number;
  durationHours: number;
  durationDays: number;
  mode: TransportMode;
  speedKmh: number;
}

/**
 * Historical and modern average sustained travel speeds
 */
export const TRANSPORT_SPEEDS: Record<TransportMode, { speedKmh: number; hoursPerDay: number }> = {
  foot: { speedKmh: 4.5, hoursPerDay: 8 },           // ~36 km/day
  horse: { speedKmh: 12.0, hoursPerDay: 8 },         // ~96 km/day with relay couriers
  sailing_ship: { speedKmh: 11.0, hoursPerDay: 24 }, // ~264 km/day continuous
  steam_train: { speedKmh: 45.0, hoursPerDay: 16 },  // ~720 km/day
  flight: { speedKmh: 750.0, hoursPerDay: 18 }       // modern long-haul air transit
};

/**
 * Simplified low-resolution vector landmasses for major continental outlines
 * (Latitude, Longitude pairs). Air-gapped and self-contained (< 5 KB).
 */
export const OFFLINE_CONTINENT_POLYGONS: Array<{ name: string; coordinates: [number, number][] }> = [
  {
    name: 'Africa',
    coordinates: [
      [37, 10], [32, 32], [12, 44], [-12, 40], [-26, 33], [-34, 18],
      [-17, 12], [5, 2], [15, -17], [31, -10], [37, 10]
    ]
  },
  {
    name: 'Eurasia',
    coordinates: [
      [36, -9], [43, 9], [37, 28], [42, 28], [30, 48], [24, 57], [13, 80],
      [22, 90], [10, 105], [22, 120], [39, 124], [60, 140], [70, 179],
      [73, 80], [71, 28], [58, 6], [48, -5], [36, -9]
    ]
  },
  {
    name: 'North America',
    coordinates: [
      [72, -156], [60, -165], [32, -117], [16, -93], [8, -78], [25, -80],
      [35, -75], [45, -65], [60, -64], [70, -70], [72, -156]
    ]
  },
  {
    name: 'South America',
    coordinates: [
      [11, -73], [-5, -80], [-18, -71], [-54, -68], [-52, -58], [-23, -42],
      [-5, -35], [5, -52], [11, -73]
    ]
  },
  {
    name: 'Australia',
    coordinates: [
      [-12, 131], [-22, 114], [-35, 115], [-38, 145], [-28, 153], [-11, 142], [-12, 131]
    ]
  },
  {
    name: 'Antarctica',
    coordinates: [
      [-64, -60], [-72, -20], [-68, 60], [-66, 120], [-72, 170], [-78, -160], [-64, -60]
    ]
  }
];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;

/**
 * Computes great-circle distance between two geographic coordinates via Haversine formula
 */
export function calculateGreatCircleDistance(p1: GeoPoint, p2: GeoPoint, radiusKm = EARTH_RADIUS_KM): number {
  const phi1 = p1.lat * DEG_TO_RAD;
  const phi2 = p2.lat * DEG_TO_RAD;
  const deltaPhi = (p2.lat - p1.lat) * DEG_TO_RAD;
  const deltaLambda = (p2.lng - p1.lng) * DEG_TO_RAD;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(radiusKm * c * 100) / 100;
}

/**
 * Interpolates intermediate points along a great-circle arc (spherical slerp)
 */
export function interpolateGreatCircleRoute(p1: GeoPoint, p2: GeoPoint, steps = 10): GeoPoint[] {
  if (steps <= 1) return [{ lat: p1.lat, lng: p1.lng }, { lat: p2.lat, lng: p2.lng }];

  const lat1 = p1.lat * DEG_TO_RAD;
  const lon1 = p1.lng * DEG_TO_RAD;
  const lat2 = p2.lat * DEG_TO_RAD;
  const lon2 = p2.lng * DEG_TO_RAD;

  // Angular distance
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  ));

  if (d < 1e-6) {
    return [{ lat: p1.lat, lng: p1.lng }, { lat: p2.lat, lng: p2.lng }];
  }

  const points: GeoPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);

    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD_TO_DEG;
    const lng = Math.atan2(y, x) * RAD_TO_DEG;

    points.push({
      lat: Math.round(lat * 1000) / 1000,
      lng: Math.round(lng * 1000) / 1000
    });
  }

  return points;
}

/**
 * Estimates historical transit time and duration between two points
 */
export function estimateTransitTime(p1: GeoPoint, p2: GeoPoint, mode: TransportMode): TransitEstimate {
  const distanceKm = calculateGreatCircleDistance(p1, p2);
  const config = TRANSPORT_SPEEDS[mode] || TRANSPORT_SPEEDS.foot;
  const dailyKm = config.speedKmh * config.hoursPerDay;
  const durationHours = Math.round((distanceKm / config.speedKmh) * 10) / 10;
  const durationDays = Math.round((distanceKm / dailyKm) * 10) / 10;

  return {
    distanceKm,
    durationHours,
    durationDays,
    mode,
    speedKmh: config.speedKmh
  };
}

/**
 * Standard 2D Equirectangular map projection (Plate Carrée)
 */
export function projectEquirectangular(
  point: GeoPoint,
  width = 800,
  height = 400
): ProjectedPoint {
  // normalize lng to [-180, 180]
  let lng = point.lng % 360;
  if (lng > 180) lng -= 360;
  if (lng < -180) lng += 360;

  const x = ((lng + 180) / 360) * width;
  const y = ((90 - point.lat) / 180) * height;

  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    visible: true
  };
}

/**
 * 3D Orthographic globe projection onto a circular viewport
 */
export function projectOrthographic(
  point: GeoPoint,
  center: GeoPoint,
  radius: number,
  viewWidth = radius * 2,
  viewHeight = radius * 2
): ProjectedPoint {
  const phi = point.lat * DEG_TO_RAD;
  const lambda = point.lng * DEG_TO_RAD;
  const phi0 = center.lat * DEG_TO_RAD;
  const lambda0 = center.lng * DEG_TO_RAD;

  // Angular distance from projection center
  const cosC = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda - lambda0);
  const visible = cosC >= 0; // Point is on the visible front hemisphere

  const xOffset = radius * Math.cos(phi) * Math.sin(lambda - lambda0);
  const yOffset = -radius * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda - lambda0));

  const centerX = viewWidth / 2;
  const centerY = viewHeight / 2;

  return {
    x: Math.round((centerX + xOffset) * 10) / 10,
    y: Math.round((centerY + yOffset) * 10) / 10,
    visible
  };
}

/**
 * Offline Globe Engine for self-contained vector map rendering and journey replay
 */
export class OfflineGlobeEngine {
  public center: GeoPoint;
  public radius: number;
  public width: number;
  public height: number;
  public projection: 'orthographic' | 'equirectangular';

  constructor(options: {
    center?: GeoPoint;
    radius?: number;
    width?: number;
    height?: number;
    projection?: 'orthographic' | 'equirectangular';
  } = {}) {
    this.center = options.center || { lat: 20, lng: 0 };
    this.radius = options.radius || 150;
    this.width = options.width || 400;
    this.height = options.height || 400;
    this.projection = options.projection || 'orthographic';
  }

  public setCenter(lat: number, lng: number): void {
    this.center = { lat, lng };
  }

  public project(point: GeoPoint): ProjectedPoint {
    if (this.projection === 'equirectangular') {
      return projectEquirectangular(point, this.width, this.height);
    }
    return projectOrthographic(point, this.center, this.radius, this.width, this.height);
  }

  /**
   * Generates a lightweight, self-contained SVG string representing the globe,
   * landmasses, and narrative routes.
   */
  public renderToSvg(routePoints: GeoPoint[] = []): string {
    const cx = this.width / 2;
    const cy = this.height / 2;

    const svgParts: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" width="${this.width}" height="${this.height}">`,
      `<style>
        .globe-bg { fill: #0b1120; }
        .ocean { fill: #0f172a; stroke: #38bdf8; stroke-width: 1.5; }
        .landmass { fill: #1e293b; stroke: #64748b; stroke-width: 1; fill-opacity: 0.8; }
        .route-line { fill: none; stroke: #38bdf8; stroke-width: 2.5; stroke-dasharray: 4,3; }
        .waypoint { fill: #f59e0b; stroke: #ffffff; stroke-width: 1.5; }
      </style>`,
      `<rect width="${this.width}" height="${this.height}" class="globe-bg" />`
    ];

    if (this.projection === 'orthographic') {
      svgParts.push(`<circle cx="${cx}" cy="${cy}" r="${this.radius}" class="ocean" />`);
    }

    // Render landmasses
    for (const continent of OFFLINE_CONTINENT_POLYGONS) {
      const projected = continent.coordinates.map(c => this.project({ lat: c[0], lng: c[1] }));
      const visiblePoints = projected.filter(p => p.visible);
      if (visiblePoints.length >= 3) {
        const d = projected
          .filter(p => p.visible)
          .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
          .join(' ') + ' Z';
        svgParts.push(`<path d="${d}" class="landmass" data-name="${continent.name}" />`);
      }
    }

    // Render route line
    if (routePoints.length >= 2) {
      let interpolated: GeoPoint[] = [];
      for (let i = 0; i < routePoints.length - 1; i++) {
        const seg = interpolateGreatCircleRoute(routePoints[i], routePoints[i + 1], 8);
        if (i > 0) seg.shift();
        interpolated = interpolated.concat(seg);
      }

      const projectedRoute = interpolated.map(pt => this.project(pt));
      const pathSegments: string[] = [];
      let currentPath: string[] = [];

      for (const pt of projectedRoute) {
        if (pt.visible) {
          currentPath.push(`${currentPath.length === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`);
        } else if (currentPath.length > 0) {
          pathSegments.push(currentPath.join(' '));
          currentPath = [];
        }
      }
      if (currentPath.length > 0) {
        pathSegments.push(currentPath.join(' '));
      }

      for (const seg of pathSegments) {
        svgParts.push(`<path d="${seg}" class="route-line" />`);
      }

      // Render waypoint dots
      for (const wp of routePoints) {
        const p = this.project(wp);
        if (p.visible) {
          svgParts.push(`<circle cx="${p.x}" cy="${p.y}" r="4" class="waypoint" />`);
          if (wp.label) {
            svgParts.push(`<text x="${p.x + 6}" y="${p.y + 4}" fill="#f8fafc" font-size="11" font-family="sans-serif">${wp.label}</text>`);
          }
        }
      }
    }

    svgParts.push(`</svg>`);
    return svgParts.join('\n');
  }

  /**
   * Computes multi-leg journey metrics (total distance, duration per leg, and overall elapsed days)
   */
  public calculateMultiLegJourney(waypoints: GeoPoint[], mode: TransportMode): {
    totalDistanceKm: number;
    totalDays: number;
    legs: TransitEstimate[];
  } {
    if (waypoints.length < 2) {
      return { totalDistanceKm: 0, totalDays: 0, legs: [] };
    }

    const legs: TransitEstimate[] = [];
    let totalDistanceKm = 0;
    let totalDays = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const leg = estimateTransitTime(waypoints[i], waypoints[i + 1], mode);
      legs.push(leg);
      totalDistanceKm += leg.distanceKm;
      totalDays += leg.durationDays;
    }

    return {
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      totalDays: Math.round(totalDays * 10) / 10,
      legs
    };
  }
}
