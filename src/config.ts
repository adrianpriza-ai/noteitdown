import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface NoteitdownConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

export const CONFIG_DIR = join(homedir(), ".noteitdown");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

/**
 * Load configuration from environment variables first, then from the local
 * config file. This lets `SUPABASE_URL` / `SUPABASE_KEY` override the saved
 * configuration at runtime.
 */
export function loadConfig(): NoteitdownConfig | null {
  const envUrl = process.env.SUPABASE_URL?.trim();
  const envKey = process.env.SUPABASE_KEY?.trim();

  if (envUrl && envKey) {
    return { supabaseUrl: envUrl, supabaseKey: envKey };
  }

  if (!existsSync(CONFIG_PATH)) {
    if (envUrl || envKey) {
      const missing: string[] = [];
      if (!envUrl) missing.push("SUPABASE_URL");
      if (!envKey) missing.push("SUPABASE_KEY");
      throw new Error(
        `Missing environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
        `Both SUPABASE_URL and SUPABASE_KEY must be set together.`
      );
    }
    return null;
  }

  let fileConfig: Partial<NoteitdownConfig>;
  try {
    fileConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to read config file at ${CONFIG_PATH}: ${(err as Error).message}`);
  }

  const supabaseUrl = (envUrl || fileConfig.supabaseUrl || "").trim();
  const supabaseKey = (envKey || fileConfig.supabaseKey || "").trim();

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return { supabaseUrl, supabaseKey };
}

/** Persist configuration to the local config file. */
export function saveConfig(config: NoteitdownConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}
