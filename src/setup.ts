import prompts from "prompts";
import { existsSync } from "node:fs";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CONFIG_PATH, saveConfig } from "./config.js";
import { createNotesTable } from "./db.js";

function isValidSupabaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith("supabase.co");
  } catch {
    return false;
  }
}

/** Probe the project to confirm the key is valid and detect a missing table. */
async function probe(
  client: SupabaseClient
): Promise<"ok" | "missing-table" | "error"> {
  const { error } = await client.from("notes").select("id").limit(1);
  if (!error) return "ok";
  if (error.message.includes("does not exist")) return "missing-table";
  return "error";
}

export async function runSetup(): Promise<void> {
  console.log("noteitdown setup\n");
  console.log(
    "This will configure noteitdown to use YOUR OWN Supabase project.\n" +
      "Find your Project URL and Anon Key in Supabase → Project Settings → API.\n"
  );

  const prev = existsSync(CONFIG_PATH)
    ? "\n(Existing config found — it will be overwritten.)\n"
    : "";
  if (prev) console.log(prev);

  const response = await prompts(
    [
      {
        type: "text",
        name: "supabaseUrl",
        message: "Supabase Project URL (https://xxxx.supabase.co):",
        validate: (v: string) =>
          isValidSupabaseUrl(v.trim()) ||
          "Please enter a valid https://*.supabase.co URL.",
      },
      {
        type: "password",
        name: "supabaseKey",
        message: "Supabase Anon Key:",
        validate: (v: string) =>
          v.trim().length > 0 || "Anon key is required.",
      },
      {
        type: "password",
        name: "dbPassword",
        message:
          "Database password (optional — needed to auto-create the notes table; leave blank to try the SQL API):",
      },
    ],
    {
      onCancel: () => {
        console.log("\nSetup cancelled.");
        process.exit(1);
      },
    }
  );

  const supabaseUrl = response.supabaseUrl.trim();
  const supabaseKey = response.supabaseKey.trim();
  const dbPassword = response.dbPassword?.trim() || undefined;

  console.log("\nValidating connection...");

  let client: SupabaseClient;
  try {
    client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
    const status = await probe(client);
    if (status === "error") {
      const { error } = await client.from("notes").select("id").limit(1);
      throw new Error(
        `Could not connect with the provided credentials: ${error?.message ?? "unknown error"}`
      );
    }
    if (status === "ok") {
      console.log("Connected and the `notes` table already exists.");
    } else {
      console.log("Connected. The `notes` table does not exist yet.");
    }
  } catch (err) {
    console.error(`\n✗ ${(err as Error).message}`);
    process.exit(1);
  }

  if ((await probe(client)) !== "ok") {
    console.log("Creating the `notes` table...");
    const result = await createNotesTable(supabaseUrl, supabaseKey, dbPassword);

    if (result.ok) {
      console.log(`✓ ${result.message}`);
    } else {
      console.error(`\n✗ ${result.message}`);
      console.error(
        "\nPlease create the table manually by running this SQL in the Supabase SQL editor:"
      );
      console.error("\n" + result.sql + "\n");
      // Still save config so data operations work once the table exists.
    }

    const recheck = await probe(client);
    if (recheck !== "ok") {
      console.error(
        "The `notes` table is not reachable yet. Re-run `noteitdown setup` after creating it."
      );
    }
  }

  saveConfig({ supabaseUrl, supabaseKey });
  console.log(`\n✓ Configuration saved to ${CONFIG_PATH}`);
  console.log("You can now use noteitdown as an MCP server.");
  console.log(
    "Tip: set SUPABASE_URL and SUPABASE_KEY environment variables to override this config."
  );
}
