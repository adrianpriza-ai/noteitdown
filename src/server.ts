import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getClient } from "./client.js";
import { debug, log } from "./logger.js";
import { rateLimiter } from "./rateLimiter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dynamic version from package.json
let version = "1.0.0";
try {
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  version = pkg.version;
} catch {
  // Fallback to default if package.json not found
}

// Types
interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Maximum characters of note content to include in list/search responses.
 * Keeps LLM context windows from being flooded by long notes.
 */
const CONTENT_PREVIEW_LENGTH = 300;

// Formatting helpers

/**
 * Truncate long content for list/preview contexts, appending a hint that
 * the full text is available via get_note.
 */
function truncateContent(content: string, maxLength: number = CONTENT_PREVIEW_LENGTH): string {
  if (!content || content.length <= maxLength) return content;
  const cutoff = content.lastIndexOf(" ", maxLength);
  const breakPoint = cutoff > maxLength * 0.8 ? cutoff : maxLength;
  return content.slice(0, breakPoint) + "\n\n_[+content truncated—full content available via get_note]_\n";
}

interface ExtractLinesResult {
  content: string;
  totalLines: number;
  startLine: number; // 0-indexed
  endLine: number;   // 0-indexed, inclusive
}

/**
 * Extract a range of lines from content. Returns the selected lines plus
 * metadata about the total and selected range.
 *
 * - If lineLimit is undefined and lineStart is 0: returns full content.
 * - If lineLimit is undefined and lineStart > 0: returns from lineStart to end.
 * - If both are provided: returns the requested slice.
 */
function extractLines(
  content: string,
  lineStart: number,
  lineLimit?: number
): ExtractLinesResult {
  const lines = content.split("\n");
  const totalLines = lines.length;

  const start = Math.max(0, lineStart);
  if (lineLimit === undefined) {
    if (start === 0) {
      return { content, totalLines, startLine: 0, endLine: totalLines - 1 };
    }
    // Only line_start given — return from that line to end
    const selectedLines = lines.slice(start);
    return {
      content: selectedLines.join("\n"),
      totalLines,
      startLine: start,
      endLine: totalLines - 1,
    };
  }

  const end = Math.min(totalLines - 1, start + lineLimit - 1);
  const selectedLines = lines.slice(start, end + 1);

  return {
    content: selectedLines.join("\n"),
    totalLines,
    startLine: start,
    endLine: end,
  };
}

interface FormatNoteOptions {
  contentPreviewLength?: number;
  lineStart?: number;
  lineLimit?: number;
}

function formatNote(note: Note, options?: FormatNoteOptions): string {
  const tags = note.tags?.length ? note.tags.join(", ") : "(no tags)";

  let body: string;
  let lineInfo: string | null = null;

  if (options?.lineStart !== undefined || options?.lineLimit !== undefined) {
    const extracted = extractLines(
      note.content || "",
      options?.lineStart ?? 0,
      options?.lineLimit
    );
    body = extracted.content;
    lineInfo = `_lines: ${extracted.startLine + 1}–${extracted.endLine + 1} of ${extracted.totalLines}_`;
  } else if (options?.contentPreviewLength !== undefined) {
    body = truncateContent(note.content || "", options.contentPreviewLength);
  } else {
    body = note.content || "";
  }

  const parts: string[] = [
    `# ${note.title || "(untitled)"}`,
    "",
    `_id: ${note.id}_`,
    `_tags: ${tags}_`,
    `_updated: ${note.updated_at}_`,
  ];
  if (lineInfo) parts.push(lineInfo);
  parts.push("", body);

  return parts.join("\n");
}

function formatNotes(notes: Note[], totalCount?: number, contentPreviewLength?: number): string {
  if (notes.length === 0) return "No notes found.";
  const header =
    totalCount !== undefined
      ? `Total: ${totalCount} note${totalCount !== 1 ? "s" : ""}\n\n`
      : "";
  const formatted = notes.map((note) =>
    formatNote(note, contentPreviewLength !== undefined ? { contentPreviewLength } : undefined)
  );
  return header + formatted.join("\n\n---\n\n");
}

// ─── Multi-range helpers for get_note_range ───────────────────────────────

interface LineRange {
  lineStart: number; // 0-indexed, inclusive
  lineEnd: number;   // 0-indexed, inclusive
}

const MAX_RANGES = 50;
const MAX_TOTAL_LINES = 1000;

/**
 * Validate and sort an array of line ranges, merging any that overlap or
 * are adjacent (touch each other). Returns null if validation fails.
 */
function normalizeRanges(ranges: LineRange[]): LineRange[] | null {
  if (!ranges || ranges.length === 0 || ranges.length > MAX_RANGES) return null;

  // Sort by start line
  const sorted = [...ranges]
    .map((r) => ({ lineStart: Math.max(0, r.lineStart), lineEnd: Math.max(0, r.lineEnd) }))
    .sort((a, b) => a.lineStart - b.lineStart);

  if (sorted.length === 0) return null;

  // Merge overlapping / adjacent ranges
  const merged: LineRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    // Adjacent ranges (curr starts at last.end + 1) are merged too
    if (curr.lineStart <= last.lineEnd + 1) {
      last.lineEnd = Math.max(last.lineEnd, curr.lineEnd);
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

/**
 * Format multiple line ranges from a note. Each range is rendered as an
 * H3 section heading with the 1-based line numbers, followed by the content.
 */
function formatNoteRanges(
  note: Note,
  ranges: LineRange[]
): string {
  const lines = note.content.split("\n");
  const totalLines = lines.length;

  const sections: string[] = [];
  let totalReturned = 0;

  for (const range of ranges) {
    const start = Math.min(range.lineStart, totalLines - 1);
    const end = Math.min(range.lineEnd, totalLines - 1);
    if (start > end) continue;

    const selectedLines = lines.slice(start, end + 1);
    totalReturned += selectedLines.length;

    // Use 1-based line numbers in the heading for readability
    const heading = `### Lines ${start + 1}–${end + 1}`;
    sections.push(heading);
    sections.push("");
    sections.push(selectedLines.join("\n"));
    sections.push("");
  }

  const tags = note.tags?.length ? note.tags.join(", ") : "(no tags)";

  return [
    `# ${note.title || "(untitled)"}`,
    "",
    `_id: ${note.id}_`,
    `_tags: ${tags}_`,
    `_updated: ${note.updated_at}_`,
    `_total lines: ${totalLines}_`,
    `_returned: ${totalReturned} lines across ${ranges.length} range${ranges.length !== 1 ? "s" : ""}_`,
    "",
    "---",
    "",
    ...sections,
  ].join("\n");
}

// Server bootstrap

export async function startServer(): Promise<void> {
  const server = new McpServer(
    { name: "noteitdown", version },
    { capabilities: { tools: {}, resources: {} } }
  );

  // Resource: individual notes
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

  // Resource: list all notes as a resource collection
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
          text: formatNote(note, { contentPreviewLength: CONTENT_PREVIEW_LENGTH }),
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

  // Tool: list_notes (with pagination)
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
      rateLimiter.check("global");
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
            text: formatNotes(notes, count ?? undefined, CONTENT_PREVIEW_LENGTH),
          },
        ],
      };
    }
  );

  // Tool: get_note
  server.tool(
    "get_note",
    "Get a single note by its UUID. Returns the note content in Markdown format with metadata header (id, tags, timestamps). " +
    "Supports optional line_start/line_limit to retrieve a specific range of lines, preventing very long notes from filling the LLM context window. " +
    "The response includes a '_lines: X–Y of Z_' indicator showing which lines are returned. " +
    "Omit line_start/line_limit (or omit both) to get the full note content.",
    {
      id: z.string().describe("The UUID of the note to retrieve."),
      line_start: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("0-based line number to start from. Use with line_limit to paginate through long notes."),
      line_limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Maximum number of lines to return (1-500). Omit to get all lines from line_start onward, or to get the full note."),
    },
    async ({ id, line_start, line_limit }) => {
      rateLimiter.check("global");
      debug("Getting note:", { id, line_start, line_limit });
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

      // Only pass line range params when line_limit is explicitly provided
      // (line_start alone with no line_limit just means "skip N lines, give me the rest")
      const options: { lineStart?: number; lineLimit?: number } = {};
      if (line_limit !== undefined) {
        options.lineStart = line_start ?? 0;
        options.lineLimit = line_limit;
      } else if (line_start !== undefined && line_start > 0) {
        // If only line_start is given without line_limit, return from that line to end
        options.lineStart = line_start;
      }

      return {
        content: [
          {
            type: "text",
            text: formatNote(note, Object.keys(options).length > 0 ? options : undefined),
          },
        ],
      };
    }
  );

  // Tool: create_note
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
      rateLimiter.check("global");
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

  // Tool: update_note
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
      rateLimiter.check("global");
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

  // Tool: delete_note
  server.tool(
    "delete_note",
    "Delete a note by its UUID. This action cannot be undone. Returns a confirmation message.",
    {
      id: z.string().describe("The UUID of the note to delete."),
    },
    async ({ id }) => {
      rateLimiter.check("global");
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

  // Tool: search_notes
  server.tool(
    "search_notes",
    "Search notes by a free-text query across title and Markdown content. Uses case-insensitive partial matching. Returns matching notes in Markdown format.",
    {
      query: z.string().describe("The search term to look for in note titles and content."),
    },
    async ({ query }) => {
      rateLimiter.check("global");
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
        content: [{ type: "text", text: header + formatNotes(notes, undefined, CONTENT_PREVIEW_LENGTH) }],
      };
    }
  );

  // Tool: get_note_range
  server.tool(
    "get_note_range",
    "Get multiple non-contiguous line ranges from a single note by UUID. " +
    "Useful for reading specific sections of a very long note without loading the entire content. " +
    "Accepts an array of {line_start, line_end} ranges (0-based, inclusive). " +
    "Overlapping or adjacent ranges are automatically merged. " +
    "Returns each range as a separate section with a heading like '### Lines 10–25'. " +
    "The response includes total line count and a summary of what was returned.",
    {
      id: z.string().describe("The UUID of the note to retrieve ranges from."),
      ranges: z
        .array(
          z.object({
            line_start: z
              .number()
              .int()
              .min(0)
              .describe("0-based start line (inclusive)."),
            line_end: z
              .number()
              .int()
              .min(0)
              .describe("0-based end line (inclusive). Must be >= line_start."),
          })
        )
        .min(1)
        .max(50)
        .describe("Array of line ranges to extract (1-50 ranges). Overlapping/adjacent ranges will be merged."),
    },
    async ({ id, ranges }) => {
      rateLimiter.check("global");
      debug("Getting note ranges:", { id, ranges });

      // Validate each range: line_end must be >= line_start
      for (const r of ranges) {
        if (r.line_end < r.line_start) {
          throw new Error(
            `Invalid range: line_end (${r.line_end}) must be >= line_start (${r.line_start})`
          );
        }
      }

      const note = await withClient(async (client) => {
        const { data, error } = await client
          .from("notes")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw new Error(error.message);
        return data as Note;
      });
      log("Note ranges retrieved:", note.id);

      const normalized = normalizeRanges(
        ranges.map((r) => ({ lineStart: r.line_start, lineEnd: r.line_end }))
      );

      if (!normalized) {
        throw new Error("No valid ranges provided after normalization.");
      }

      // Check total line count across all ranges
      const totalRequested = normalized.reduce(
        (sum, r) => sum + (r.lineEnd - r.lineStart + 1),
        0
      );
      if (totalRequested > MAX_TOTAL_LINES) {
        throw new Error(
          `Total lines requested (${totalRequested}) exceeds maximum (${MAX_TOTAL_LINES}). ` +
          `Reduce the range sizes or number of ranges.`
        );
      }

      return {
        content: [
          {
            type: "text",
            text: formatNoteRanges(note, normalized),
          },
        ],
      };
    }
  );

  // Tool: health_check
  server.tool(
    "health_check",
    "Verify the noteitdown MCP server is running and connected to Supabase. Returns a status message indicating whether the server is healthy.",
    {},
    async () => {
      rateLimiter.check("global");
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
              text: `noteitdown MCP server v${version} is healthy and connected to Supabase.`,
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

  // Tool: batch_delete_notes
  server.tool(
    "batch_delete_notes",
    "Delete multiple notes by their UUIDs in a single operation. Returns a confirmation with the count of deleted notes.",
    {
      ids: z
        .array(z.string())
        .describe("Array of note UUIDs to delete."),
    },
    async ({ ids }) => {
      rateLimiter.check("global");
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

  // Transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server running on stdio");
}
