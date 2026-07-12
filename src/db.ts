import { Client } from "pg";

export const NOTES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notes'
      AND policyname = 'noteitdown_anon_all'
  ) THEN
    CREATE POLICY noteitdown_anon_all ON public.notes
      FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.noteitdown_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS noteitdown_updated_at ON public.notes;
CREATE TRIGGER noteitdown_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.noteitdown_set_updated_at();
`.trim();

export type CreateTableResult =
  | { ok: true; method: "pg"; message: string }
  | { ok: true; method: "sql-api"; message: string }
  | { ok: false; method: "manual"; message: string; sql: string };

function deriveProjectRef(supabaseUrl: string): string {
  const host = new URL(supabaseUrl).host;
  const ref = host.split(".")[0];
  if (!ref) {
    throw new Error(`Could not derive project reference from URL: ${supabaseUrl}`);
  }
  return ref;
}

/**
 * Create the `notes` table (and supporting RLS policy + updated_at trigger)
 * in the user's Supabase project.
 *
 * Strategy:
 *   1. If a database password is supplied, connect directly over Postgres and
 *      run the DDL. This is the most reliable path and works with the anon key
 *      for subsequent data access.
 *   2. Otherwise attempt the Supabase SQL endpoint with the anon key.
 *   3. If neither works, return the SQL for the user to run manually.
 */
export async function createNotesTable(
  supabaseUrl: string,
  anonKey: string,
  dbPassword?: string
): Promise<CreateTableResult> {
  if (dbPassword) {
    const ref = deriveProjectRef(supabaseUrl);
    const client = new Client({
      host: `${ref}.supabase.co`,
      port: 5432,
      user: "postgres",
      password: dbPassword,
      database: "postgres",
      connectionTimeoutMillis: 15000,
    });
    try {
      await client.connect();
      await client.query(NOTES_TABLE_SQL);
      return {
        ok: true,
        method: "pg",
        message: "Created the `notes` table via direct Postgres connection.",
      };
    } catch (err) {
      await client.end().catch(() => {});
      return {
        ok: false,
        method: "manual",
        message: `Could not create the table over Postgres: ${(err as Error).message}`,
        sql: NOTES_TABLE_SQL,
      };
    }
  }

  // Fall back to the Supabase SQL endpoint (works on projects that allow it).
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ query: NOTES_TABLE_SQL }),
    });
    if (res.ok) {
      return {
        ok: true,
        method: "sql-api",
        message: "Created the `notes` table via the Supabase SQL endpoint.",
      };
    }
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      method: "manual",
      message: `SQL endpoint returned ${res.status}. ${body}`.trim(),
      sql: NOTES_TABLE_SQL,
    };
  } catch (err) {
    return {
      ok: false,
      method: "manual",
      message: `Could not reach the SQL endpoint: ${(err as Error).message}`,
      sql: NOTES_TABLE_SQL,
    };
  }
}
