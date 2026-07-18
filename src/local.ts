import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { log } from "./logger.js";

// How many characters of note content to return in list responses.
// Clients can override with ?content=full to get the complete body.
const CONTENT_PREVIEW_LENGTH = 300;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Env-var config with sensible defaults
const PORT = parseInt(process.env.NOTEITDOWN_PORT || "3721", 10);
const DB_PATH = process.env.NOTEITDOWN_DB_PATH || join(homedir(), ".noteitdown", "notes.db");

// Ensure directories exist
function ensureDirectories(): void {
  const dbDir = dirname(DB_PATH);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    log(`Created database directory: ${dbDir}`);
  }
}

// Initialize SQLite database
function initializeDatabase(): Database.Database {
  ensureDirectories();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_content ON notes(content)
  `);

  log(`SQLite database initialized at ${DB_PATH}`);
  return db;
}

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface NoteRow {
  id: string;
  title: string;
  content: string;
  tags: string; // JSON string
  created_at: string;
  updated_at: string;
}

/**
 * Truncate note content for list/preview contexts so that MCP clients
 * (LLM agents) don't get their context window filled by long notes.
 */
function truncateContent(content: string, maxLength: number = CONTENT_PREVIEW_LENGTH): string {
  if (!content || content.length <= maxLength) return content;
  const cutoff = content.lastIndexOf(" ", maxLength);
  const breakPoint = cutoff > maxLength * 0.8 ? cutoff : maxLength;
  return content.slice(0, breakPoint) + "\n\n_[+content truncated—full content available via single-note request]_\n";
}

interface ExtractLinesResult {
  content: string;
  totalLines: number;
  startLine: number;
  endLine: number;
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

function rowToNote(row: NoteRow): Note {
  return {
    ...row,
    tags: JSON.parse(row.tags || "[]"),
  };
}

function noteToRow(note: Note): NoteRow {
  return {
    ...note,
    tags: JSON.stringify(note.tags || []),
  };
}

// Serve static files
function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  contentType: string = "text/html"
): boolean {
  try {
    const absolutePath = join(__dirname, "..", filePath);
    if (!existsSync(absolutePath)) {
      return false;
    }

    let content = readFileSync(absolutePath, "utf-8");
    if (filePath === "index.html") {
      content = content.replace(
        "<head>",
        "<head>\n    <script>window.NOTEITDOWN_LOCAL_MODE = true;</script>"
      );
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

// API Helpers
function sendJson(
  res: ServerResponse,
  status: number,
  data: unknown
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function sendError(
  res: ServerResponse,
  status: number,
  message: string
): void {
  sendJson(res, status, { error: message });
}

// API Handlers
function handleListNotes(db: Database.Database): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse): void => {
    try {
      const url = new URL(req.url || "/", `http://localhost:${PORT}`);
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);
      const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);
      const search = (url.searchParams.get("search") || "").trim();
      const contentMode = (url.searchParams.get("content") || "preview").trim();

      let rows: NoteRow[];
      let total: number;

      if (search) {
        const pattern = `%${search}%`;
        rows = db
          .prepare(`SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
          .all(pattern, pattern, limit, offset) as NoteRow[];
        const countResult = db
          .prepare(`SELECT COUNT(*) as count FROM notes WHERE title LIKE ? OR content LIKE ?`)
          .get(pattern, pattern) as { count: number };
        total = countResult?.count ?? 0;
      } else {
        rows = db
          .prepare(`SELECT * FROM notes ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
          .all(limit, offset) as NoteRow[];
        const countResult = db
          .prepare(`SELECT COUNT(*) as count FROM notes`)
          .get() as { count: number };
        total = countResult?.count ?? 0;
      }

      const notes = rows.map(rowToNote).map((note) => {
        if (contentMode !== "full") {
          return { ...note, content: truncateContent(note.content) };
        }
        return note;
      });

      sendJson(res, 200, { notes, total, limit, offset });
    } catch (err) {
      log("Error listing notes:", err);
      sendError(res, 500, "Failed to list notes");
    }
  };
}

function handleGetNote(db: Database.Database, id: string): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse): void => {
    try {
      const url = new URL(req.url || "/", `http://localhost:${PORT}`);
      const lineStart = parseInt(url.searchParams.get("line_start") || "", 10);
      const lineLimit = parseInt(url.searchParams.get("line_limit") || "", 10);

      const stmt = db.prepare("SELECT * FROM notes WHERE id = ?");
      const row = stmt.get(id) as NoteRow | undefined;

      if (!row) {
        sendError(res, 404, "Note not found");
        return;
      }

      const note = rowToNote(row);

      // Apply line range if line_limit is provided
      if (!isNaN(lineLimit) && lineLimit > 0) {
        const extracted = extractLines(
          note.content,
          isNaN(lineStart) ? 0 : Math.max(0, lineStart),
          Math.min(lineLimit, 500)
        );
        sendJson(res, 200, {
          ...note,
          content: extracted.content,
          _line_range: {
            start: extracted.startLine + 1,
            end: extracted.endLine + 1,
            total: extracted.totalLines,
          },
        });
        return;
      }

      sendJson(res, 200, note);
    } catch (err) {
      log("Error getting note:", err);
      sendError(res, 500, "Failed to get note");
    }
  };
}

function handleCreateNote(db: Database.Database): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse): void => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(body) as Note;
        const now = new Date().toISOString();
        const note: Note = {
          id: data.id || randomUUID(),
          title: data.title || "",
          content: data.content || "",
          tags: data.tags || [],
          created_at: data.created_at || now,
          updated_at: data.updated_at || now,
        };

        const stmt = db.prepare(
          `INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
        );
        const row = noteToRow(note);
        stmt.run(row.id, row.title, row.content, row.tags, row.created_at, row.updated_at);

        sendJson(res, 201, note);
      } catch (err) {
        log("Error creating note:", err);
        sendError(res, 500, "Failed to create note");
      }
    });
  };
}

function handleUpdateNote(db: Database.Database, id: string): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse): void => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(body) as Partial<Note>;
        const now = new Date().toISOString();

        // Get existing note
        const selectStmt = db.prepare("SELECT * FROM notes WHERE id = ?");
        const existingRow = selectStmt.get(id) as NoteRow | undefined;

        let resultNote: Note;
        if (!existingRow) {
          // Upsert: Create new note
          resultNote = {
            id,
            title: data.title !== undefined ? data.title : "Untitled",
            content: data.content !== undefined ? data.content : "",
            tags: data.tags !== undefined ? data.tags : [],
            created_at: data.created_at || now,
            updated_at: data.updated_at || now,
          };
          const insertStmt = db.prepare(
            `INSERT INTO notes (id, title, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
          );
          const row = noteToRow(resultNote);
          insertStmt.run(row.id, row.title, row.content, row.tags, row.created_at, row.updated_at);
        } else {
          // Update existing note
          const existingNote = rowToNote(existingRow);
          resultNote = {
            id,
            title: data.title !== undefined ? data.title : existingNote.title,
            content: data.content !== undefined ? data.content : existingNote.content,
            tags: data.tags !== undefined ? data.tags : existingNote.tags,
            created_at: existingNote.created_at,
            updated_at: data.updated_at || now,
          };
          const updateStmt = db.prepare(
            `UPDATE notes SET title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?`
          );
          const row = noteToRow(resultNote);
          updateStmt.run(row.title, row.content, row.tags, row.updated_at, id);
        }

        sendJson(res, 200, resultNote);
      } catch (err) {
        log("Error updating note:", err);
        sendError(res, 500, "Failed to update note");
      }
    });
  };
}

function handleDeleteNote(db: Database.Database, id: string): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse): void => {
    try {
      const stmt = db.prepare("DELETE FROM notes WHERE id = ?");
      const result = stmt.run(id);

      if (result.changes === 0) {
        sendError(res, 404, "Note not found");
        return;
      }

      sendJson(res, 200, { message: "Note deleted", id });
    } catch (err) {
      log("Error deleting note:", err);
      sendError(res, 500, "Failed to delete note");
    }
  };
}

// Router
function handleRequest(db: Database.Database): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = req.url || "/";

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    // API Routes
    if (url.startsWith("/api/notes")) {
      const parsedUrl = new URL(url, `http://localhost:${PORT}`);
      const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
      
      if (pathParts[0] === "api" && pathParts[1] === "notes") {
        const id = pathParts[2];
        
        if (req.method === "GET") {
          if (id) {
            handleGetNote(db, id)(req, res);
          } else {
            handleListNotes(db)(req, res);
          }
        } else if (req.method === "POST") {
          if (id) {
            sendError(res, 400, "POST not allowed on individual note resource");
          } else {
            handleCreateNote(db)(req, res);
          }
        } else if (req.method === "PUT") {
          if (!id) {
            sendError(res, 400, "Note ID is required");
          } else {
            handleUpdateNote(db, id)(req, res);
          }
        } else if (req.method === "DELETE") {
          if (!id) {
            sendError(res, 400, "Note ID is required");
          } else {
            handleDeleteNote(db, id)(req, res);
          }
        } else {
          sendError(res, 405, "Method not allowed");
        }
        return;
      }
    }

    // Static files
    if (url === "/" || url === "/index.html") {
      if (serveStaticFile(req, res, "index.html", "text/html")) return;
    } else if (url === "/style.css") {
      if (serveStaticFile(req, res, "style.css", "text/css")) return;
    } else if (url.startsWith("/css/")) {
      const fileName = url.substring(5);
      if (serveStaticFile(req, res, `css/${fileName}`, "text/css")) return;
    } else if (url.startsWith("/js/")) {
      const fileName = url.substring(4);
      if (serveStaticFile(req, res, `js/${fileName}`, "application/javascript")) return;
    } else if (url === "/script.js") {
      if (serveStaticFile(req, res, "script.js", "application/javascript")) return;
    }

    // Not found
    sendError(res, 404, "Not found");
  };
}

// Start the server
export async function startLocalServer(): Promise<void> {
  log("Starting NoteItDown local server...");

  const db = initializeDatabase();

  const server = createServer(handleRequest(db));

  server.on("error", (err) => {
    log("Server error:", err);
  });

  server.listen(PORT, "localhost", () => {
    log(`NoteItDown local server running at http://localhost:${PORT}`);
    log(`SQLite database at: ${DB_PATH}`);
    log("Press Ctrl+C to stop the server");
    log("Override with NOTEITDOWN_PORT / NOTEITDOWN_DB_PATH env vars");
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    log("\nShutting down...");
    db.close();
    server.close(() => {
      log("Server stopped");
      process.exit(0);
    });
  });

  process.on("SIGTERM", () => {
    log("\nShutting down...");
    db.close();
    server.close(() => {
      log("Server stopped");
      process.exit(0);
    });
  });
}
