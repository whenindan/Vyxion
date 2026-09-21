import { degToRad, radToDeg, normalizeDeg } from "../units/index.js";

export interface LatLon {
  lat: number; // degrees, +N
  lon: number; // degrees, +E
}

const EARTH_RADIUS_NM = 3440.065;

/** Great-circle distance in nautical miles (haversine). */
export function greatCircleDistanceNm(a: LatLon, b: LatLon): number {
  const phi1 = degToRad(a.lat);
  const phi2 = degToRad(b.lat);
  const dPhi = degToRad(b.lat - a.lat);
  const dLambda = degToRad(b.lon - a.lon);

  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_NM * c;
}

/** Initial true bearing in degrees [0, 360) from a to b along the great circle. */
export function initialBearingDeg(a: LatLon, b: LatLon): number {
  const phi1 = degToRad(a.lat);
  const phi2 = degToRad(b.lat);
  const dLambda = degToRad(b.lon - a.lon);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return normalizeDeg(radToDeg(Math.atan2(y, x)));
}

/**
 * Point at fraction `f` (0 = a, 1 = b) along the great circle from a to b.
 * Uses the standard spherical interpolation formula; a and b must not be antipodal.
 */
export function intermediatePoint(a: LatLon, b: LatLon, f: number): LatLon {
  const distRad = greatCircleDistanceNm(a, b) / EARTH_RADIUS_NM;
  if (distRad === 0) return a;

  const phi1 = degToRad(a.lat);
  const lambda1 = degToRad(a.lon);
  const phi2 = degToRad(b.lat);
  const lambda2 = degToRad(b.lon);

  const A = Math.sin((1 - f) * distRad) / Math.sin(distRad);
  const B = Math.sin(f * distRad) / Math.sin(distRad);

  const x =
    A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
  const y =
    A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
  const z = A * Math.sin(phi1) + B * Math.sin(phi2);

  const phi3 = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lambda3 = Math.atan2(y, x);

  return { lat: radToDeg(phi3), lon: radToDeg(lambda3) };
}
