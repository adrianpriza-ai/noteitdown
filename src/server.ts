import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getClient } from "./client.js";
import { debug, log } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Dynamic version from package.json ────────────────────────────────
let version = "1.0.0";
try {
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  version = pkg.version;
} catch {
  // Fallback to default if package.json not found
}

// ── Types ────────────────────────────────────────────────────────────
interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ── Formatting helpers ───────────────────────────────────────────────

function formatNote(note: Note): string {
  const tags = note.tags?.length ? note.tags.join(", ") : "(no tags)";
  return [
    `# ${note.title || "(untitled)"}`,
    "",
    `_id: ${note.id}_`,
    `_tags: ${tags}_`,
    `_updated: ${note.updated_at}_`,
    "",
    note.content || "",
  ].join("\n");
}

function formatNotes(notes: Note[], totalCount?: number): string {
  if (notes.length === 0) return "No notes found.";
  const header =
    totalCount !== undefined
      ? `Total: ${totalCount} note${totalCount !== 1 ? "s" : ""}\n\n`
      : "";
  return header + notes.map(formatNote).join("\n\n---\n\n");
}

// ── Server bootstrap ─────────────────────────────────────────────────

export async function startServer(): Promise<void> {
  const server = new McpServer(
    { name: "noteitdown", version },
    { capabilities: { tools: {}, resources: {} } }
  );

  // ── Resource: individual notes ──────────────────────────────────
  server.resource(
    "note",
    new ResourceTemplate("noteitdown://note/{id}", {
      list: undefined,
    }),
    async (uri, { id }) => {
      debug("Resource requested:", uri.href);
      const note = await withClient(async (client) => {
        const { data, error } = await client
          .from("notes")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw new Error(error.message);
        return data as Note;
      });
      return {
        contents: [
          {
            uri: uri.href,
            text: formatNote(note),
            mimeType: "text/markdown",
          },
        ],
      };
    }
  );

  // ── Resource: list all notes as a resource collection ───────────
  server.resource(
    "notes-list",
    "noteitdown://notes",
    async (uri) => {
      debug("Resource list requested:", uri.href);
      const notes = await withClient(async (client) => {
        const { data, error } = await client
          .from("notes")
          .select("*")
          .order("updated_at", { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []) as Note[];
      });
      return {
        contents: notes.map((note) => ({
          uri: `noteitdown://note/${note.id}`,
          text: formatNote(note),
          mimeType: "text/markdown",
        })),
      };
    }
  );

  const withClient = async <T>(
    fn: (client: ReturnType<typeof getClient>) => Promise<T>
  ): Promise<T> => {
    const client = getClient();
    return fn(client);
  };

  // ── Tool: list_notes (with pagination) ──────────────────────────
  server.tool(
    "list_notes",
    "List all Markdown notes, newest updated first. Supports pagination with limit and offset. Returns notes in Markdown format with metadata (id, title, tags, timestamps).",
    {
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of notes to return (1-100)."),
      offset: z
        .number()
        .optional()
        .default(0)
        .describe("Number of notes to skip."),
    },
    async ({ limit, offset }) => {
      debug("Listing notes:", { limit, offset });
      const { notes, count } = await withClient(async (client) => {
        const { data, error, count } = await client
          .from("notes")
          .select("*", { count: "exact" })
          .order("updated_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw new Error(error.message);
        return { notes: (data ?? []) as Note[], count };
      });
      return {
        content: [
          {
            type: "text",
            text: formatNotes(notes, count ?? undefined),
          },
        ],
      };
    }
  );

  // ── Tool: get_note ──────────────────────────────────────────────
  server.tool(
    "get_note",
    "Get a single note by its UUID. Returns the note content in Markdown format with metadata header (id, tags, timestamps).",
    {
      id: z.string().describe("The UUID of the note to retrieve."),
    },
    async ({ id }) => {
      debug("Getting note:", id);
      const note = await withClient(async (client) => {
        const { data, error } = await client
          .from("notes")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw new Error(error.message);
        return data as Note;
      });
      log("Note retrieved:", note.id);
      return { content: [{ type: "text", text: formatNote(note) }] };
    }
  );

  // ── Tool: create_note ───────────────────────────────────────────
  server.tool(
    "create_note",
    "Create a new Markdown note with an optional title, content, and tags. Returns the created note with generated ID and timestamps.",
    {
      title: z.string().describe("Note title."),
      content: z.string().describe("Markdown body of the note."),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional list of tags for categorizing the note."),
    },
    async ({ title, content, tags }) => {
      debug("Creating note:", { title, tags });
      const note = await withClient(async (client) => {
        const { data, error } = await client
          .from("notes")
          .insert({ title, content, tags: tags ?? [] })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as Note;
      });
      log("Note created:", note.id);
      return {
        content: [
          { type: "text", text: `Created note:\n\n${formatNote(note)}` },
        ],
      };
    }
  );

  // ── Tool: update_note ───────────────────────────────────────────
  server.tool(
    "update_note",
    "Update an existing note's title, content, and/or tags. Provide at least one field to update. Returns the updated note in Markdown format.",
    {
      id: z.string().describe("The UUID of the note to update."),
      title: z.string().optional().describe("New title for the note."),
      content: z.string().optional().describe("New Markdown body."),
      tags: z
        .array(z.string())
        .optional()
        .describe("New list of tags (replaces existing tags)."),
    },
    async ({ id, title, content, tags }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (content !== undefined) patch.content = content;
      if (tags !== undefined) patch.tags = tags;

      if (Object.keys(patch).length === 0) {
        throw new Error(
          "Provide at least one of title, content, or tags to update."
        );
      }

      debug("Updating note:", { id, ...patch });
      const note = await withClient(async (client) => {
        const { data, error } = await client
          .from("notes")
          .update(patch)
          .eq("id", id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as Note;
      });
      log("Note updated:", note.id);
      return {
        content: [
          { type: "text", text: `Updated note:\n\n${formatNote(note)}` },
        ],
      };
    }
  );

  // ── Tool: delete_note ───────────────────────────────────────────
  server.tool(
    "delete_note",
    "Delete a note by its UUID. This action cannot be undone. Returns a confirmation message.",
    {
      id: z.string().describe("The UUID of the note to delete."),
    },
    async ({ id }) => {
      debug("Deleting note:", id);
      await withClient(async (client) => {
        const { error } = await client.from("notes").delete().eq("id", id);
        if (error) throw new Error(error.message);
      });
      log("Note deleted:", id);
      return {
        content: [{ type: "text", text: `Deleted note ${id}.` }],
      };
    }
  );

  // ── Tool: search_notes ──────────────────────────────────────────
  server.tool(
    "search_notes",
    "Search notes by a free-text query across title and Markdown content. Uses case-insensitive partial matching. Returns matching notes in Markdown format.",
    {
      query: z.string().describe("The search term to look for in note titles and content."),
    },
    async ({ query }) => {
      debug("Searching notes:", query);
      const notes = await withClient(async (client) => {
        const { data, error } = await client
          .from("notes")
          .select("*")
          .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
          .order("updated_at", { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []) as Note[];
      });
      const header = `Search results for "${query}":\n\n`;
      return {
        content: [{ type: "text", text: header + formatNotes(notes) }],
      };
    }
  );

  // ── Tool: health_check ──────────────────────────────────────────
  server.tool(
    "health_check",
    "Verify the noteitdown MCP server is running and connected to Supabase. Returns a status message indicating whether the server is healthy.",
    {},
    async () => {
      debug("Health check requested");
      try {
        await withClient(async (client) => {
          await client.from("notes").select("id").limit(1);
        });
        log("Health check: OK");
        return {
          content: [
            {
              type: "text",
              text: "✅ noteitdown MCP server is healthy and connected to Supabase.",
            },
          ],
        };
      } catch (err) {
        throw new Error(
          `Health check failed: ${(err as Error).message}`
        );
      }
    }
  );

  // ── Tool: batch_delete_notes ────────────────────────────────────
  server.tool(
    "batch_delete_notes",
    "Delete multiple notes by their UUIDs in a single operation. Returns a confirmation with the count of deleted notes.",
    {
      ids: z
        .array(z.string())
        .describe("Array of note UUIDs to delete."),
    },
    async ({ ids }) => {
      debug("Batch deleting notes:", ids.length);
      await withClient(async (client) => {
        const { error } = await client
          .from("notes")
          .delete()
          .in("id", ids);
        if (error) throw new Error(error.message);
      });
      log(`Batch deleted ${ids.length} notes`);
      return {
        content: [
          {
            type: "text",
            text: `Deleted ${ids.length} note${ids.length !== 1 ? "s" : ""}.`,
          },
        ],
      };
    }
  );

  // ── Transport ───────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server running on stdio");
}
