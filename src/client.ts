import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loadConfig, NoteitdownConfig } from "./config.js";

/** Build a Supabase client from the given (or loaded) configuration. */
export function getClient(config?: NoteitdownConfig): SupabaseClient {
  const cfg = config ?? loadConfig();
  if (!cfg) {
    throw new Error(
      "noteitdown is not configured. Run `noteitdown setup` first, or set SUPABASE_URL and SUPABASE_KEY."
    );
  }
  return createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: false },
  });
}


