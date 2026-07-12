#!/usr/bin/env node
import { runSetup } from "./setup.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  const command = process.argv[2]?.trim();

  if (command === "setup") {
    await runSetup();
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(
      [
        "noteitdown — store Markdown notes in your own Supabase project.",
        "",
        "Usage:",
        "  noteitdown setup   Configure Supabase URL + Anon Key and create the notes table.",
        "  noteitdown         Start the MCP server (stdio).",
        "",
        "Environment overrides:",
        "  SUPABASE_URL   Override the saved Supabase Project URL.",
        "  SUPABASE_KEY   Override the saved Supabase Anon Key.",
      ].join("\n")
    );
    return;
  }

  if (command && command !== "serve") {
    console.error(`Unknown command: ${command}\nRun \`noteitdown help\` for usage.`);
    process.exit(1);
  }

  await startServer();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
