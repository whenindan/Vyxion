// WMM2025 magnetic declination (magnetic variation).
//
// Coefficients in ./wmm2025-coefficients.json are NOAA/NCEI & BGS public-domain data,
// transcribed verbatim from the official WMM2025 COF (epoch 2025.0, valid 2025-2030).
//
// The spherical-harmonic synthesis below (geodetic->geocentric conversion, Schmidt
// quasi-normalized associated Legendre recursion, and the field summation) follows the
// standard NOAA WMM algorithm as implemented in the reference C software; this TS port's
// structure was checked against the equivalent open-source port at
// naturalatlas/geomagnetism (Apache-2.0) for correctness of the recursions and signs.
import wmm2025 from "./wmm2025-coefficients.json";
import type { LatLon } from "./greatCircle.js";

const WGS84_A_KM = 6378.137;
const WGS84_B_KM = 6356.7523142;
const REFERENCE_RADIUS_KM = 6371.2;
const ECC_SQ = 1 - (WGS84_B_KM * WGS84_B_KM) / (WGS84_A_KM * WGS84_A_KM);

interface CoefficientRow {
  n: number;
  m: number;
  gnm: number;
  hnm: number;
  dgnm: number;
  dhnm: number;
}

const N_MAX = 12;
const NUM_TERMS = ((N_MAX + 1) * (N_MAX + 2)) / 2;

/** Index into the flat (n,m) coefficient arrays, matching the NOAA WMM convention. */
function idx(n: number, m: number): number {
  return (n * (n + 1)) / 2 + m;
}

function buildCoefficientArrays(epoch: number, decimalYear: number): { g: Float64Array; h: Float64Array } {
  const g = new Float64Array(NUM_TERMS);
  const h = new Float64Array(NUM_TERMS);
  const dYear = decimalYear - epoch;
  for (const row of wmm2025.coefficients as CoefficientRow[]) {
    const i = idx(row.n, row.m);
    g[i] = row.gnm + dYear * row.dgnm;
    h[i] = row.hnm + dYear * row.dhnm;
  }
  return { g, h };
}

/** Schmidt quasi-normalized associated Legendre functions and their theta-derivatives. */
function legendre(sinPhi: number): { p: Float64Array; dp: Float64Array } {
  const p = new Float64Array(NUM_TERMS);
  const dp = new Float64Array(NUM_TERMS);
  const schmidt = new Float64Array(NUM_TERMS);
  p[0] = 1;
  dp[0] = 0;
  schmidt[0] = 1;

  const z = Math.sqrt(1 - sinPhi * sinPhi);

  for (let n = 1; n <= N_MAX; n++) {
    for (let m = 0; m <= n; m++) {
      const i = idx(n, m);
      if (n === m) {
        const i1 = idx(n - 1, m - 1);
        p[i] = z * p[i1];
        dp[i] = z * dp[i1] + sinPhi * p[i1];
      } else if (n === 1 && m === 0) {
        const i1 = idx(0, 0);
        p[i] = sinPhi * p[i1];
        dp[i] = sinPhi * dp[i1] - z * p[i1];
      } else {
        const i1 = idx(n - 2, m);
        const i2 = idx(n - 1, m);
        if (m > n - 2) {
          p[i] = sinPhi * p[i2];
          dp[i] = sinPhi * dp[i2] - z * p[i2];
        } else {
          const k = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
          p[i] = sinPhi * p[i2] - k * p[i1];
          dp[i] = sinPhi * dp[i2] - z * p[i2] - k * dp[i1];
        }
      }
    }
  }

  for (let n = 1; n <= N_MAX; n++) {
    const i = idx(n, 0);
    const i1 = idx(n - 1, 0);
    schmidt[i] = (schmidt[i1] * (2 * n - 1)) / n;
    for (let m = 1; m <= n; m++) {
      const im = idx(n, m);
      const im1 = idx(n, m - 1);
      schmidt[im] = schmidt[im1] * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
    }
  }

  for (let n = 1; n <= N_MAX; n++) {
    for (let m = 0; m <= n; m++) {
      const i = idx(n, m);
      p[i] *= schmidt[i];
      dp[i] *= -schmidt[i];
    }
  }

  return { p, dp };
}

/**
 * Magnetic declination (variation) in degrees, WMM2025 model, positive East.
 * `date` selects the epoch-relative time (model valid 2025.0-2030.0); `altitudeFtMsl`
 * defaults to sea level, which is accurate enough for GA cruise altitudes (declination
 * varies negligibly with altitude over this range).
 */
export function magneticVariationDeg(point: LatLon, date: Date, altitudeFtMsl = 0): number {
  const decimalYear =
    date.getUTCFullYear() +
    (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) /
      (Date.UTC(date.getUTCFullYear() + 1, 0, 1) - Date.UTC(date.getUTCFullYear(), 0, 1));

  const { g, h } = buildCoefficientArrays(wmm2025.epoch, decimalYear);

  const heightKm = (altitudeFtMsl / 3280.839895) * 1; // ft -> km
  const latRad = (point.lat * Math.PI) / 180;
  const lonRad = (point.lon * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);

  const rc = WGS84_A_KM / Math.sqrt(1 - ECC_SQ * sinLat * sinLat);
  const xp = (rc + heightKm) * cosLat;
  const zp = (rc * (1 - ECC_SQ) + heightKm) * sinLat;
  const r = Math.sqrt(xp * xp + zp * zp);
  const geocentricLat = Math.asin(zp / r);
  const sinPhig = Math.sin(geocentricLat);
  const cosPhig = Math.cos(geocentricLat);

  const { p, dp } = legendre(sinPhig);

  const cosM = new Float64Array(N_MAX + 1);
  const sinM = new Float64Array(N_MAX + 1);
  cosM[0] = 1;
  sinM[0] = 0;
  if (N_MAX >= 1) {
    cosM[1] = Math.cos(lonRad);
    sinM[1] = Math.sin(lonRad);
  }
  for (let m = 2; m <= N_MAX; m++) {
    cosM[m] = cosM[m - 1] * cosM[1] - sinM[m - 1] * sinM[1];
    sinM[m] = cosM[m - 1] * sinM[1] + sinM[m - 1] * cosM[1];
  }

  const relRadiusPower = new Float64Array(N_MAX + 1);
  relRadiusPower[0] = (REFERENCE_RADIUS_KM / r) * (REFERENCE_RADIUS_KM / r);
  for (let n = 1; n <= N_MAX; n++) {
    relRadiusPower[n] = relRadiusPower[n - 1] * (REFERENCE_RADIUS_KM / r);
  }

  let bx = 0;
  let by = 0;
  let bz = 0;
  for (let n = 1; n <= N_MAX; n++) {
    for (let m = 0; m <= n; m++) {
      const i = idx(n, m);
      const term = g[i] * cosM[m] + h[i] * sinM[m];
      bz -= relRadiusPower[n] * term * (n + 1) * p[i];
      by += relRadiusPower[n] * (g[i] * sinM[m] - h[i] * cosM[m]) * m * p[i];
      bx -= relRadiusPower[n] * term * dp[i];
    }
  }
  by = Math.abs(cosPhig) > 1e-10 ? by / cosPhig : 0;

  // Rotate from geocentric to geodetic frame.
  const psi = geocentricLat - latRad;
  const bxGeodetic = bx * Math.cos(psi) - bz * Math.sin(psi);
  const byGeodetic = by;

  return (Math.atan2(byGeodetic, bxGeodetic) * 180) / Math.PI;
}
