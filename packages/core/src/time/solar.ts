// NOAA Solar Calculator equations (the same formulas behind
// https://gml.noaa.gov/grad/solcalc/), used to derive sunrise/sunset and civil twilight
// for a given UTC instant and location. All inputs/outputs are UTC `Date`s; local display
// only happens through the zone helpers in ./zone.ts (never here).
import type { LatLon } from "../geo/greatCircle.js";

const deg2rad = (d: number): number => (d * Math.PI) / 180;
const rad2deg = (r: number): number => (r * 180) / Math.PI;

const MS_PER_DAY = 86400000;
const JULIAN_UNIX_EPOCH = 2440587.5; // JD at 1970-01-01T00:00:00Z

function toJulianDay(date: Date): number {
  return date.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
}

function fromJulianDay(jd: number): Date {
  return new Date((jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY);
}

interface SunPosition {
  /** Equation of time, in minutes. */
  eqOfTimeMin: number;
  /** Apparent solar declination, in degrees. */
  declinationDeg: number;
}

function sunPositionAt(julianDay: number): SunPosition {
  const T = (julianDay - 2451545) / 36525;

  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  const Mrad = deg2rad(M);
  const C =
    Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mrad) * 0.000289;

  const trueLong = L0 + C;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(deg2rad(125.04 - 1934.136 * T));

  const meanObliq = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliqCorr = meanObliq + 0.00256 * Math.cos(deg2rad(125.04 - 1934.136 * T));

  const declinationDeg = rad2deg(Math.asin(Math.sin(deg2rad(obliqCorr)) * Math.sin(deg2rad(appLong))));

  const y = Math.tan(deg2rad(obliqCorr / 2)) ** 2;
  const eqOfTimeMin =
    4 *
    rad2deg(
      y * Math.sin(2 * deg2rad(L0)) -
        2 * e * Math.sin(Mrad) +
        4 * e * y * Math.sin(Mrad) * Math.cos(2 * deg2rad(L0)) -
        0.5 * y * y * Math.sin(4 * deg2rad(L0)) -
        1.25 * e * e * Math.sin(2 * Mrad),
    );

  return { eqOfTimeMin, declinationDeg };
}

/**
 * UTC instant of solar noon and the hour-angle-derived crossing times for a given
 * zenith angle (90.833 = standard sunrise/sunset with refraction, 96 = civil twilight),
 * evaluated near `date` (any UTC instant on the day of interest).
 */
function crossingTimes(date: Date, point: LatLon, zenithDeg: number): { rise: Date; set: Date } | null {
  // JD's integer boundary falls at UTC noon, not midnight, so derive UTC midnight of
  // `date`'s own calendar day explicitly rather than flooring toJulianDay(date).
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayStartJd = toJulianDay(new Date(utcMidnight));

  const sun = sunPositionAt(dayStartJd + 0.5); // approximate sun position at UTC noon

  const latRad = deg2rad(point.lat);
  const declRad = deg2rad(sun.declinationDeg);
  const cosHA =
    (Math.cos(deg2rad(zenithDeg)) - Math.sin(latRad) * Math.sin(declRad)) / (Math.cos(latRad) * Math.cos(declRad));

  if (cosHA > 1 || cosHA < -1) {
    // Polar day (> 1) or polar night (< -1): no rise/set on this day.
    return null;
  }

  const haDeg = rad2deg(Math.acos(cosHA));

  const solarNoonFraction = (720 - 4 * point.lon - sun.eqOfTimeMin) / 1440;
  const riseFraction = solarNoonFraction - (haDeg * 4) / 1440;
  const setFraction = solarNoonFraction + (haDeg * 4) / 1440;

  return {
    rise: fromJulianDay(dayStartJd + riseFraction),
    set: fromJulianDay(dayStartJd + setFraction),
  };
}

export interface SolarTimes {
  sunrise: Date | null;
  sunset: Date | null;
  civilDawn: Date | null;
  civilDusk: Date | null;
}

const SUNRISE_SUNSET_ZENITH = 90.833;
const CIVIL_TWILIGHT_ZENITH = 96;

/** Sunrise/sunset and civil twilight bounds for the UTC calendar day containing `date`. */
export function solarTimes(date: Date, point: LatLon): SolarTimes {
  const standard = crossingTimes(date, point, SUNRISE_SUNSET_ZENITH);
  const civil = crossingTimes(date, point, CIVIL_TWILIGHT_ZENITH);
  return {
    sunrise: standard?.rise ?? null,
    sunset: standard?.set ?? null,
    civilDawn: civil?.rise ?? null,
    civilDusk: civil?.set ?? null,
  };
}

/**
 * The three regulatory "night" definitions actually used in 14 CFR:
 * - `91.209`: position/anticollision lights, sunset to sunrise (14 CFR 91.209(a)).
 * - `61.57b`: night currency (landings), 1 hour after sunset to 1 hour before sunrise
 *   (14 CFR 61.57(b)).
 * - `61.51`: night flight-time logging, end of evening civil twilight to beginning of
 *   morning civil twilight (14 CFR 1.1 "night", cross-referenced by 61.51(b)).
 */
export type NightRule = "91.209" | "61.57b" | "61.51";

export interface NightWindow {
  /** Start of the night period on the UTC day containing `date` (dusk side). */
  start: Date | null;
  /** End of the night period, i.e. the following dawn. */
  end: Date | null;
}

const ONE_HOUR_MS = 3600000;

/** The dusk->dawn night window for `rule`, spanning from `date`'s sunset/dusk into the next day's sunrise/dawn. */
export function nightWindow(date: Date, point: LatLon, rule: NightRule): NightWindow {
  const today = solarTimes(date, point);
  const tomorrow = solarTimes(new Date(date.getTime() + MS_PER_DAY), point);

  switch (rule) {
    case "91.209":
      return { start: today.sunset, end: tomorrow.sunrise };
    case "61.57b": {
      const start = today.sunset ? new Date(today.sunset.getTime() + ONE_HOUR_MS) : null;
      const end = tomorrow.sunrise ? new Date(tomorrow.sunrise.getTime() - ONE_HOUR_MS) : null;
      return { start, end };
    }
    case "61.51":
      return { start: today.civilDusk, end: tomorrow.civilDawn };
  }
}

function withinWindow(date: Date, window: NightWindow): boolean {
  if (!window.start || !window.end) return false;
  return date >= window.start && date < window.end;
}

/**
 * Whether `date` (a UTC instant) falls within night per `rule` at `point`. Checks both
 * the window that starts on `date`'s own UTC day (evening) and the one anchored to the
 * previous UTC day (covering the pre-dawn hours of the night that began the day before).
 */
export function isNight(date: Date, point: LatLon, rule: NightRule): boolean {
  const todayWindow = nightWindow(date, point, rule);
  const priorDay = new Date(date.getTime() - MS_PER_DAY);
  const priorWindow = nightWindow(priorDay, point, rule);
  return withinWindow(date, todayWindow) || withinWindow(date, priorWindow);
}
