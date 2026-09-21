import { describe, expect, it } from "vitest";
import { formatZulu, zonedParts } from "./zone.js";

describe("zonedParts", () => {
  // Arizona (America/Phoenix) does not observe DST — unlike Flagstaff's geographic
  // neighbors on the Navajo Nation (America/Denver, which does), both KPRC (Prescott)
  // and KFLG (Flagstaff) sit in America/Phoenix. This is the specific gotcha PLAN.md
  // calls out: the UTC offset must stay -420 min (MST) year-round for both, in winter
  // and summer alike, with no DST jump.
  it("keeps a constant -7:00 offset across the DST boundary for America/Phoenix", () => {
    const winter = zonedParts(new Date("2026-01-15T20:00:00Z"), "America/Phoenix");
    const summer = zonedParts(new Date("2026-07-15T20:00:00Z"), "America/Phoenix");
    expect(winter.utcOffsetMinutes).toBe(-420);
    expect(summer.utcOffsetMinutes).toBe(-420);
  });

  it("resolves correct local wall-clock time", () => {
    const parts = zonedParts(new Date("2026-01-15T20:00:00Z"), "America/Phoenix");
    expect(parts.hour).toBe(13);
    expect(parts.minute).toBe(0);
  });

  it("still reflects DST in a zone that observes it, for contrast", () => {
    const winter = zonedParts(new Date("2026-01-15T20:00:00Z"), "America/Denver");
    const summer = zonedParts(new Date("2026-07-15T20:00:00Z"), "America/Denver");
    expect(winter.utcOffsetMinutes).toBe(-420); // MST
    expect(summer.utcOffsetMinutes).toBe(-360); // MDT
  });
});

describe("formatZulu", () => {
  it("formats as HH:MMZ", () => {
    expect(formatZulu(new Date("2026-01-15T05:07:00Z"))).toBe("05:07Z");
  });
});
