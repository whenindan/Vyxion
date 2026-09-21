// EXPO_PUBLIC_* vars are inlined into the client bundle at build time — fine here since
// a Supabase anon/publishable key and a PowerSync sync endpoint are both meant to be
// public; access control is enforced server-side (RLS, PowerSync sync rules).
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

export const AppConfig = {
  supabaseUrl: requireEnv("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  powersyncUrl: requireEnv("EXPO_PUBLIC_POWERSYNC_URL", process.env.EXPO_PUBLIC_POWERSYNC_URL),
};
