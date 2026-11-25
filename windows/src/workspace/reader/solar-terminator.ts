/**
 * Solar Ephemeris & Day/Night Shadow Terminator
 * 
 * Computes astronomical solar declination, subsolar coordinates, solar zenith angle,
 * and day/night twilight terminator curve across the globe for historical journey rendering.
 * 
 * Inspired by bilawalsidhu/gods-eye-view celestial and temporal lighting models.
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export interface SubsolarPoint {
  lat: number; // Solar declination delta
  lng: number; // Subsolar longitude
}

export type IlluminationState = 'day' | 'civil_twilight' | 'nautical_twilight' | 'night';

export class SolarTerminatorEngine {
  /**
   * Computes subsolar geographic point (where the sun is directly overhead) for a UTC date
   */
  public static computeSubsolarPoint(date: Date = new Date()): SubsolarPoint {
    const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000) + 1;

    // Solar declination (approximate astronomical formula)
    const declination = -23.44 * Math.cos(((360 / 365.25) * (dayOfYear + 10)) * DEG_TO_RAD);

    // UTC fractional hours
    const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

    // Subsolar longitude: at 12:00 UTC, subsolar longitude is ~0 deg. Earth rotates 15 deg/hour.
    let subsolarLng = -(utcHours - 12) * 15;
    if (subsolarLng > 180) subsolarLng -= 360;
    if (subsolarLng < -180) subsolarLng += 360;

    return {
      lat: Math.round(declination * 100) / 100,
      lng: Math.round(subsolarLng * 100) / 100
    };
  }

  /**
   * Determines daylight status at a specific coordinate
   */
  public static getIllumination(lat: number, lng: number, date: Date = new Date()): {
    state: IlluminationState;
    zenithAngleDeg: number;
    solarElevationDeg: number;
  } {
    const subsolar = this.computeSubsolarPoint(date);

    const phi = lat * DEG_TO_RAD;
    const delta = subsolar.lat * DEG_TO_RAD;
    const dLambda = (lng - subsolar.lng) * DEG_TO_RAD;

    // Cosine of solar zenith angle
    const cosZenith = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(dLambda);
    const zenithRad = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
    const zenithDeg = Math.round(zenithRad * RAD_TO_DEG * 10) / 10;
    const elevationDeg = Math.round((90 - zenithDeg) * 10) / 10;

    let state: IlluminationState = 'day';
    if (zenithDeg > 108) {
      state = 'night';
    } else if (zenithDeg > 96) {
      state = 'nautical_twilight';
    } else if (zenithDeg > 90) {
      state = 'civil_twilight';
    }

    return {
      state,
      zenithAngleDeg: zenithDeg,
      solarElevationDeg: elevationDeg
    };
  }

  /**
   * Generates a series of boundary coordinates [lat, lng] representing the day/night terminator line
   */
  public static generateTerminatorPoints(date: Date = new Date(), steps = 36): Array<{ lat: number; lng: number }> {
    const subsolar = this.computeSubsolarPoint(date);
    const delta = subsolar.lat * DEG_TO_RAD;
    const points: Array<{ lat: number; lng: number }> = [];

    // Parametric circle on sphere perpendicular to subsolar direction
    for (let i = 0; i <= steps; i++) {
      const alpha = (i / steps) * 2 * Math.PI;
      // In the rotated subsolar frame, points on great circle have z' = 0
      // x' = cos(alpha), y' = sin(alpha), z' = 0
      const sinLat = -Math.cos(delta) * Math.sin(alpha);
      const lat = Math.asin(Math.max(-1, Math.min(1, sinLat))) * RAD_TO_DEG;

      const y = Math.cos(alpha);
      const x = Math.sin(delta) * Math.sin(alpha);
      const lngOffset = Math.atan2(y, x) * RAD_TO_DEG;

      let lng = subsolar.lng + lngOffset;
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;

      points.push({
        lat: Math.round(lat * 10) / 10,
        lng: Math.round(lng * 10) / 10
      });
    }

    return points;
  }
}
