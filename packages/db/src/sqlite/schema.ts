// SQLite (client) schema for the read-only reference-dataset tier (SPEC §1.4 tier 2):
// NASR core data shipped as versioned bundles and swapped atomically on cycle change.
// Mirrors packages/db/src/pg/schema.ts field-for-field where the concept applies, but
// with plain lat/lon columns (no PostGIS) — spatial lookups on-device use the R-tree
// virtual table created alongside these in the SQLiteProvider migration, not a column
// type here. Tier-1 mutable data (pilot profiles, plans, logbook) lives in PowerSync's
// own managed tables, not here.
import { real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const datasets = sqliteTable("datasets", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  cycle: text("cycle").notNull(),
  region: text("region"),
  effectiveFrom: text("effective_from").notNull(), // ISO 8601 UTC
  effectiveTo: text("effective_to").notNull(),
  issuedAt: text("issued_at").notNull(),
  source: text("source").notNull(),
  checksum: text("checksum").notNull(),
  installedAt: text("installed_at"), // null until the bundle is actually downloaded+swapped in
});

export const airports = sqliteTable(
  "airports",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    icaoId: text("icao_id"),
    faaId: text("faa_id").notNull(),
    name: text("name").notNull(),
    city: text("city"),
    state: text("state"),
    country: text("country").notNull().default("US"),
    elevationFt: real("elevation_ft"),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
  },
  (table) => [uniqueIndex("airports_dataset_id_faa_id_idx").on(table.datasetId, table.faaId)],
);

export const runways = sqliteTable("runways", {
  id: text("id").primaryKey(),
  datasetId: text("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" }),
  airportId: text("airport_id")
    .notNull()
    .references(() => airports.id, { onDelete: "cascade" }),
  ident: text("ident").notNull(),
  lengthFt: real("length_ft"),
  widthFt: real("width_ft"),
  surface: text("surface"),
  baseEndLat: real("base_end_lat"),
  baseEndLon: real("base_end_lon"),
  reciprocalEndLat: real("reciprocal_end_lat"),
  reciprocalEndLon: real("reciprocal_end_lon"),
  trueAlignmentDeg: real("true_alignment_deg"),
});

export const navaids = sqliteTable("navaids", {
  id: text("id").primaryKey(),
  datasetId: text("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" }),
  ident: text("ident").notNull(),
  navaidType: text("navaid_type").notNull(),
  freqKhz: real("freq_khz"),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
});

export const fixes = sqliteTable("fixes", {
  id: text("id").primaryKey(),
  datasetId: text("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" }),
  ident: text("ident").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
});

export const airportFrequencies = sqliteTable("airport_frequencies", {
  id: text("id").primaryKey(),
  datasetId: text("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" }),
  airportId: text("airport_id")
    .notNull()
    .references(() => airports.id, { onDelete: "cascade" }),
  freqType: text("freq_type").notNull(),
  freqMhz: real("freq_mhz").notNull(),
});

/**
 * DDL for the R-tree spatial index alongside `airports`, used for "nearest airport"
 * / bbox queries on-device. Drizzle has no R-tree column type, so this is applied as
 * raw SQL in the SQLiteProvider's `onInit` migration, not as a table definition here.
 */
export const AIRPORTS_RTREE_DDL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS airports_rtree USING rtree(
    id,
    min_lat, max_lat,
    min_lon, max_lon
  );
`;
