import { describe, expect, it } from "vitest";
import * as units from "./index.js";

describe("units", () => {
  it("round-trips nm/m", () => {
    expect(units.mToNm(units.nmToM(100))).toBeCloseTo(100, 9);
  });

  it("converts a known nm/sm figure (1 nm = 1.15078 sm)", () => {
    expect(units.nmToSm(1)).toBeCloseTo(1.15078, 4);
  });

  it("converts C to F at reference points", () => {
    expect(units.cToF(0)).toBeCloseTo(32, 9);
    expect(units.cToF(100)).toBeCloseTo(212, 9);
    expect(units.fToC(32)).toBeCloseTo(0, 9);
  });

  it("converts inHg to hPa at standard sea-level pressure", () => {
    expect(units.inHgToHpa(29.92)).toBeCloseTo(1013.25, 0);
  });

  it("converts kg/lb", () => {
    expect(units.kgToLb(1)).toBeCloseTo(2.20462, 4);
    expect(units.lbToKg(units.kgToLb(50))).toBeCloseTo(50, 6);
  });

  it("computes avgas weight at 6 lb/gal", () => {
    expect(units.avgasGalToLb(40)).toBeCloseTo(240, 9);
  });

  it("normalizes headings into [0, 360)", () => {
    expect(units.normalizeDeg(370)).toBeCloseTo(10, 9);
    expect(units.normalizeDeg(-10)).toBeCloseTo(350, 9);
    expect(units.normalizeDeg(360)).toBeCloseTo(0, 9);
  });
});
