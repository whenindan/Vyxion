// All storage/computation is UTC; this module is the only place local time is derived,
// and only for display. `TzLookup` is injected so the client (tz-lookup, offline) and
// server (geo-tz, more precise) can each supply their own implementation without core
// depending on either package.
import type { LatLon } from "../geo/greatCircle.js";

/** Resolves an IANA time zone id (e.g. "America/Phoenix") for a point. */
export type TzLookup = (point: LatLon) => string;

export interface ZonedParts {
  timeZone: string;
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  /** Offset from UTC in minutes, e.g. -420 for MST (America/Phoenix, no DST). */
  utcOffsetMinutes: number;
}

/** Breaks a UTC instant into its local calendar/clock parts in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const utcOffsetMinutes = Math.round((asUtc - date.getTime()) / 60000);

  return { timeZone, year, month, day, hour, minute, second, utcOffsetMinutes };
}

/** Formats a UTC instant as local wall-clock time in `timeZone`, e.g. "14:32 MST". */
export function formatLocal(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return dtf.format(date);
}

/** Formats a UTC instant as "HH:MMZ", the required Zulu display alongside local (§7). */
export function formatZulu(date: Date): string {
  return `${date.getUTCHours().toString().padStart(2, "0")}:${date.getUTCMinutes().toString().padStart(2, "0")}Z`;
}
