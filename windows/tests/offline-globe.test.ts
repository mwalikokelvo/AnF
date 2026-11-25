import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGreatCircleDistance,
  interpolateGreatCircleRoute,
  estimateTransitTime,
  projectEquirectangular,
  projectOrthographic,
  OfflineGlobeEngine,
  TRANSPORT_SPEEDS
} from '../src/workspace/reader/offline-globe.js';

describe('OfflineGlobeEngine & Great-Circle Transit (Frontier 4)', () => {
  const london = { lat: 51.5074, lng: -0.1278, label: 'London' };
  const paris = { lat: 48.8566, lng: 2.3522, label: 'Paris' };
  const newYork = { lat: 40.7128, lng: -74.0060, label: 'New York' };
  const tokyo = { lat: 35.6762, lng: 139.6503, label: 'Tokyo' };

  test('calculates accurate great-circle distance via Haversine', () => {
    const distLondonParis = calculateGreatCircleDistance(london, paris);
    // Real distance is ~343-344 km
    assert.ok(distLondonParis > 340 && distLondonParis < 350, `Expected ~343km, got ${distLondonParis}`);

    const distLondonNY = calculateGreatCircleDistance(london, newYork);
    // Real distance is ~5560-5580 km
    assert.ok(distLondonNY > 5500 && distLondonNY < 5600, `Expected ~5570km, got ${distLondonNY}`);
  });

  test('interpolates smooth great-circle route waypoints', () => {
    const steps = 10;
    const route = interpolateGreatCircleRoute(london, tokyo, steps);
    assert.equal(route.length, steps + 1);
    assert.equal(Math.round(route[0].lat), Math.round(london.lat));
    assert.equal(Math.round(route[route.length - 1].lat), Math.round(tokyo.lat));
  });

  test('estimates historical transit times by transport mode', () => {
    const transitHorse = estimateTransitTime(london, paris, 'horse');
    assert.equal(transitHorse.mode, 'horse');
    assert.ok(transitHorse.durationDays > 3 && transitHorse.durationDays < 5);

    const transitFlight = estimateTransitTime(london, newYork, 'flight');
    assert.equal(transitFlight.mode, 'flight');
    assert.ok(transitFlight.durationHours > 6 && transitFlight.durationHours < 9);
  });

  test('projects coordinates accurately in Equirectangular 2D space', () => {
    const p1 = projectEquirectangular({ lat: 0, lng: 0 }, 360, 180);
    assert.equal(p1.x, 180);
    assert.equal(p1.y, 90);
    assert.equal(p1.visible, true);
  });

  test('handles 3D Orthographic globe projection with front/back hemisphere visibility', () => {
    const center = { lat: 0, lng: 0 };
    const frontPoint = projectOrthographic({ lat: 10, lng: 10 }, center, 100);
    assert.equal(frontPoint.visible, true);

    const backPoint = projectOrthographic({ lat: 0, lng: 160 }, center, 100);
    assert.equal(backPoint.visible, false);
  });

  test('renders standalone SVG vector globe with offline landmasses and journey routes', () => {
    const engine = new OfflineGlobeEngine({ width: 500, height: 500, radius: 200 });
    const svg = engine.renderToSvg([london, paris, newYork]);

    assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
    assert.ok(svg.includes('class="landmass"'));
    assert.ok(svg.includes('class="route-line"'));
    assert.ok(svg.includes('class="waypoint"'));
  });

  test('computes multi-leg journey metrics', () => {
    const engine = new OfflineGlobeEngine();
    const journey = engine.calculateMultiLegJourney([london, paris, newYork], 'sailing_ship');

    assert.equal(journey.legs.length, 2);
    assert.ok(journey.totalDistanceKm > 5800);
    assert.ok(journey.totalDays > 20);
  });
});
