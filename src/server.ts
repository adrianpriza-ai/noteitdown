import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getClient } from "./client.js";

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

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

function formatNotes(notes: Note[]): string {
  if (notes.length === 0) return "No notes found.";
  return notes.map(formatNote).join("\n\n---\n\n");
}

export async function startServer(): Promise<void> {
  const server = new McpServer(
    { name: "noteitdown", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  const withClient = async <T>(fn: (client: ReturnType<typeof getClient>) => Promise<T>): Promise<T> => {
    const client = getClient();
    return fn(client);
  };

  server.tool("list_notes", "List all Markdown notes, newest updated first.", {}, async () => {
    const notes = await withClient(async (client) => {
      const { data, error } = await client
        .from("notes")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Note[];
    });
    return { content: [{ type: "text", text: formatNotes(notes) }] };
  });

  server.tool(
    "get_note",
    "Get a single note by its id.",
    { id: z.string().describe("The id (uuid) of the note to retrieve.") },
    async ({ id }) => {
      const note = await withClient(async (client) => {
        const { data, error } = await client
          .from("notes")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw new Error(error.message);
        return data as Note;
      });
      return { content: [{ type: "text", text: formatNote(note) }] };
    }
  );

  server.tool(
    "create_note",
    "Create a new Markdown note.",
    {
      title: z.string().describe("Note title."),
      content: z.string().describe("Markdown body of the note."),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional list of tags."),
    },
    async ({ title, content, tags }) => {
      const note = await withClient(async (client) => {
        const { data, error } = await client
          .from("notes")
          .insert({ title, content, tags: tags ?? [] })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as Note;
      });
      return {
        content: [{ type: "text", text: `Created note:\n\n${formatNote(note)}` }],
      };
    }
  );

  server.tool(
    "update_note",
    "Update an existing note's title, content, and/or tags.",
    {
      id: z.string().describe("The id (uuid) of the note to update."),
      title: z.string().optional().describe("New title."),
      content: z.string().optional().describe("New Markdown body."),
      tags: z.array(z.string()).optional().describe("New list of tags."),
    },
    async ({ id, title, content, tags }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (content !== undefined) patch.content = content;
      if (tags !== undefined) patch.tags = tags;

      if (Object.keys(patch).length === 0) {
        throw new Error("Provide at least one of title, content, or tags to update.");
      }

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
      return {
        content: [{ type: "text", text: `Updated note:\n\n${formatNote(note)}` }],
      };
    }
  );

  server.tool(
    "delete_note",
    "Delete a note by its id.",
    { id: z.string().describe("The id (uuid) of the note to delete.") },
    async ({ id }) => {
      await withClient(async (client) => {
        const { error } = await client.from("notes").delete().eq("id", id);
        if (error) throw new Error(error.message);
      });
      return { content: [{ type: "text", text: `Deleted note ${id}.` }] };
    }
  );

  server.tool(
    "search_notes",
    "Search notes by a free-text query across title and Markdown content.",
    { query: z.string().describe("The search term.") },
    async ({ query }) => {
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
      return { content: [{ type: "text", text: header + formatNotes(notes) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("noteitdown MCP server running on stdio.");
}
