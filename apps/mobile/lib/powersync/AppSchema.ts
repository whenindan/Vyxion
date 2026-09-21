import { column, Schema, Table } from "@powersync/react-native";

// Mirrors public.pilot_profiles (packages/db/src/pg/schema.ts) minus `id`, which
// PowerSync manages implicitly as the row's primary key.
const pilotProfiles = new Table({
  user_id: column.text,
  data: column.text, // JSON-encoded; typed shape lands in Phase 3
  created_at: column.text,
  updated_at: column.text,
});

export const AppSchema = new Schema({ pilot_profiles: pilotProfiles });

export type Database = (typeof AppSchema)["types"];
export type PilotProfileRecord = Database["pilot_profiles"];
