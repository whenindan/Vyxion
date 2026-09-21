// Postgres (server) schema, mirroring the Supabase migrations applied to the `vyxion`
// project. This is the typed source of truth going forward — future schema changes
// should be expressed here first and then applied as a migration, rather than the
// other way around.
import { sql } from "drizzle-orm";
import { bigint, customType, index, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

// drizzle-orm has no built-in PostGIS type; treat `geography` as an opaque column and
// do spatial operations (ST_DWithin, etc.) via raw SQL / PostGIS functions at query time.
const geographyPoint = customType<{ data: string }>({
  dataType() {
    return "geography(Point,4326)";
  },
});

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
  updatedAt: timestamptz("updated_at").notNull().default(sql`now()`),
});

export const pilotProfiles = pgTable(
  "pilot_profiles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    data: text("data").notNull().default("{}"), // jsonb in Postgres; typed as opaque JSON string here
    createdAt: timestamptz("created_at").notNull().default(sql`now()`),
    updatedAt: timestamptz("updated_at").notNull().default(sql`now()`),
  },
  (table) => [unique("pilot_profiles_user_id_key").on(table.userId)],
);

export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    kind: text("kind").notNull(),
    cycle: text("cycle").notNull(),
    region: text("region"),
    effectiveFrom: timestamptz("effective_from").notNull(),
    effectiveTo: timestamptz("effective_to").notNull(),
    issuedAt: timestamptz("issued_at").notNull(),
    source: text("source").notNull(),
    checksum: text("checksum").notNull(),
    storagePath: text("storage_path").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    createdAt: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (table) => [
    unique("datasets_kind_cycle_region_key").on(table.kind, table.cycle, table.region),
    index("datasets_kind_effective_idx").on(table.kind, table.effectiveFrom, table.effectiveTo),
  ],
);

export const airports = pgTable(
  "airports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    icaoId: text("icao_id"),
    faaId: text("faa_id").notNull(),
    name: text("name").notNull(),
    city: text("city"),
    state: text("state"),
    country: text("country").notNull().default("US"),
    elevationFt: numeric("elevation_ft"),
    geom: geographyPoint("geom").notNull(),
    createdAt: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (table) => [unique("airports_dataset_id_faa_id_key").on(table.datasetId, table.faaId)],
);

export const runways = pgTable("runways", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  datasetId: uuid("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" }),
  airportId: uuid("airport_id")
    .notNull()
    .references(() => airports.id, { onDelete: "cascade" }),
  ident: text("ident").notNull(),
  lengthFt: numeric("length_ft"),
  widthFt: numeric("width_ft"),
  surface: text("surface"),
  baseEndGeom: geographyPoint("base_end_geom"),
  reciprocalEndGeom: geographyPoint("reciprocal_end_geom"),
  trueAlignmentDeg: numeric("true_alignment_deg"),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
});

export const navaids = pgTable("navaids", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  datasetId: uuid("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" }),
  ident: text("ident").notNull(),
  navaidType: text("navaid_type").notNull(),
  freqKhz: numeric("freq_khz"),
  geom: geographyPoint("geom").notNull(),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
});

export const fixes = pgTable("fixes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  datasetId: uuid("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" }),
  ident: text("ident").notNull(),
  geom: geographyPoint("geom").notNull(),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
});

export const airportFrequencies = pgTable("airport_frequencies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  datasetId: uuid("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" }),
  airportId: uuid("airport_id")
    .notNull()
    .references(() => airports.id, { onDelete: "cascade" }),
  freqType: text("freq_type").notNull(),
  freqMhz: numeric("freq_mhz").notNull(),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
});
