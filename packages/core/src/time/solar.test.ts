import { describe, expect, it } from "vitest";
import { isNight, nightWindow, solarTimes } from "./solar.js";

// KPRC (Prescott, AZ), a mid-latitude point where civil twilight duration is short
// enough (~25-30 min) to stay safely inside the 61.57(b) one-hour buffer used below.
const KPRC = { lat: 34.6546, lon: -112.4188 };
const EQUINOX_UTC_NOON = new Date("2026-03-20T19:00:00Z");

describe("solarTimes", () => {
  it("orders sunrise before sunset on the same UTC day", () => {
    const { sunrise, sunset } = solarTimes(EQUINOX_UTC_NOON, KPRC);
    expect(sunrise).not.toBeNull();
    expect(sunset).not.toBeNull();
    expect(sunrise!.getTime()).toBeLessThan(sunset!.getTime());
  });

  it("puts civil dusk after sunset, and civil dawn before sunrise", () => {
    const { sunrise, sunset, civilDawn, civilDusk } = solarTimes(EQUINOX_UTC_NOON, KPRC);
    expect(civilDusk!.getTime()).toBeGreaterThan(sunset!.getTime());
    expect(civilDawn!.getTime()).toBeLessThan(sunrise!.getTime());
  });
});

describe("nightWindow / isNight per regulatory rule", () => {
  it("91.209 (sunset-to-sunrise) is the widest window", () => {
    const wide = nightWindow(EQUINOX_UTC_NOON, KPRC, "91.209");
    const currency = nightWindow(EQUINOX_UTC_NOON, KPRC, "61.57b");
    const logging = nightWindow(EQUINOX_UTC_NOON, KPRC, "61.51");

    // 61.57(b) (1 hr after sunset / 1 hr before sunrise) starts later and ends earlier
    // than 91.209 (sunset to sunrise).
    expect(currency.start!.getTime()).toBeGreaterThan(wide.start!.getTime());
    expect(currency.end!.getTime()).toBeLessThan(wide.end!.getTime());

    // 61.51 (civil twilight) starts later in the evening and ends earlier in the
    // morning than sunset/sunrise, since dusk trails sunset and dawn leads sunrise.
    expect(logging.start!.getTime()).toBeGreaterThan(wide.start!.getTime());
    expect(logging.end!.getTime()).toBeLessThan(wide.end!.getTime());
  });

  it("isNight is true well after sunset and false at local noon, for every rule", () => {
    const localNoon = new Date("2026-03-20T19:00:00Z"); // ~UTC noon local at KPRC (UTC-7)
    const localMidnight = new Date("2026-03-21T07:00:00Z");

    for (const rule of ["91.209", "61.57b", "61.51"] as const) {
      expect(isNight(localNoon, KPRC, rule)).toBe(false);
      expect(isNight(localMidnight, KPRC, rule)).toBe(true);
    }
  });
});
