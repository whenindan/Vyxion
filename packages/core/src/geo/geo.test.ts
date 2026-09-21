import { describe, expect, it } from "vitest";
import { greatCircleDistanceNm, initialBearingDeg, intermediatePoint } from "./greatCircle.js";
import { magneticVariationDeg } from "./magvar.js";

describe("greatCircle", () => {
  it("distance for 1 degree along the equator is ~1 nm per arcminute (60 nm)", () => {
    // The nautical mile is defined as 1 arcminute of latitude, so this is a
    // dimensional sanity check, not a memorized golden value.
    expect(greatCircleDistanceNm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(60, 0);
  });

  it("bearing due east/north on cardinal test points", () => {
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 6);
    expect(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 6);
  });

  it("reciprocal bearings along the equator are 180 apart", () => {
    const a = { lat: 0, lon: 0 };
    const b = { lat: 0, lon: 10 };
    const fwd = initialBearingDeg(a, b);
    const rev = initialBearingDeg(b, a);
    expect(Math.abs(fwd - rev)).toBeCloseTo(180, 6);
  });

  it("interpolates the midpoint along the equator", () => {
    const mid = intermediatePoint({ lat: 0, lon: 0 }, { lat: 0, lon: 2 }, 0.5);
    expect(mid.lat).toBeCloseTo(0, 6);
    expect(mid.lon).toBeCloseTo(1, 6);
  });
});

describe("magneticVariationDeg (WMM2025)", () => {
  // Golden values from NOAA's official "Test Values for WMM2025" table
  // (ncei.noaa.gov, WMM2025testvalues.pdf), epoch 2025.0, height 0 km.
  const epoch = new Date("2025-01-01T00:00:00Z");

  it("matches NOAA test point lat=80 lon=0", () => {
    expect(magneticVariationDeg({ lat: 80, lon: 0 }, epoch)).toBeCloseTo(1.28, 1);
  });

  it("matches NOAA test point lat=0 lon=120", () => {
    expect(magneticVariationDeg({ lat: 0, lon: 120 }, epoch)).toBeCloseTo(-0.16, 1);
  });

  it("matches NOAA test point lat=-80 lon=240", () => {
    expect(magneticVariationDeg({ lat: -80, lon: 240 }, epoch)).toBeCloseTo(68.78, 1);
  });
});
