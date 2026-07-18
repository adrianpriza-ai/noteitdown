<div align="center">

# Note It Down

A responsive, offline-first Markdown notes web application with live preview, autosave, and **two backend modes** — a fully featured **MCP (Model Context Protocol) server** for AI-driven note management via Supabase, and a **local web server** with SQLite for fully offline use.

<img src="https://adrianpriza-ai.github.io/note1.png" width="800" alt="Screenshot 1">

</div>

<details>
  <summary><b>📸 More Screenshots</b></summary>
  <div align="center">
  <br>
  <img src="https://adrianpriza-ai.github.io/note2.png" width="800" alt="Screenshot 2">
  <br>
  <img src="https://adrianpriza-ai.github.io/note3.png" width="800" alt="Screenshot 3">
  </div>
</details>

## Features

- ✍️ **Live Markdown Preview**: See your changes in real-time as you type
- 💾 **Autosave**: Notes automatically saved to localStorage (works offline)
- 🗄️ **Local Mode**: Run with SQLite backend — no cloud dependency (`npx noteitdown local`)
- ☁️ **Supabase Sync**: Optionally sync notes to your own Supabase backend
- 🔍 **Full-Text Search**: Server-side search via SQLite `LIKE` (local mode) or Supabase `ilike` (MCP mode)
- 📱 **Responsive Design**: Works on mobile, tablet, and desktop with bottom navigation
- 🔖 **Sidebar Navigation**: Browse and select notes easily
- 🎨 **Formatting Toolbar**: Quick access to common Markdown formatting (bold, italic, headings, lists, etc.)
- 🔒 **No Backend Required**: Use the hosted version, open `index.html`, or run the local server
- 🤖 **AI Chat with Tool Calling**: Chat with an AI that can read and edit your notes via tool calls (write, append, replace) using any OpenAI-compatible API
- 🧩 **MCP Server**: Exposes notes as resources and tools to AI assistants via the Model Context Protocol
- 🛡️ **Rate Limiting**: Built-in rate limiter (100 req/min) to prevent abuse
- 🔍 **Timestamps in Logs**: All log messages include ISO 8601 timestamps
- 🧠 **Context-Window Optimized**: List and search results truncate note content (300 chars preview) to prevent LLM context flooding
- 📄 **Paginated Note Reading**: `get_note` supports `line_start`/`line_limit` for reading long notes in chunks
- 📚 **Multi-Range Reading**: `get_note_range` tool fetches multiple non-contiguous line ranges from a single note

---

## 🖥️ Web Application

### Getting Started

You can use Note It Down in three ways:

#### Option 1: Hosted Version
Visit [https://adrianpriza-ai.github.io/noteitdown/](https://adrianpriza-ai.github.io/noteitdown/)

#### Option 2: Static Local
Simply open `index.html` in any modern web browser:
```bash
# Double-click the file, or
python3 -m http.server 8080
# Then visit http://localhost:8080
```
Notes are stored in browser `localStorage` only.

#### Option 3: Local SQLite Server (Recommended for local use)
Start a fully local web server with an SQLite backend — no cloud, no configuration:
```bash
npx noteitdown local
# Opens at http://localhost:3721
```

### How It Works

- **Offline First**: Notes are immediately saved to browser's localStorage
- **Live Preview**: Markdown is rendered in real-time using [marked.js](https://marked.js.org)
- **Autosave**: Changes are saved after an 800ms debounce delay
- **Dual Persistence (Local Server Mode)**: Notes are saved to both localStorage (fast cache) and the SQLite database (persistent storage) via a REST API
- **Conflict Resolution**: Uses last-write-wins strategy based on `updated_at` timestamps

### Optional Supabase Setup

To enable cloud synchronization alongside local storage:

1. Create a free project at [supabase.com](https://supabase.com)
2. Get your Project URL and anon key from Settings → API
3. Run `npx noteitdown setup`, or create the `notes` table manually — see [Schema](#schema) for the SQL
4. Click the ⚙️ Settings button in the app and enter your URL and key

### Optional AI Chat Setup

To enable the AI chat with note editing:

1. Open Settings → AI Chat
2. Toggle **Enable AI Chat** on
3. Enter your OpenAI-compatible API endpoint and API key
4. Click **Refresh Models** to load available models
5. Select your preferred model

The AI has access to tools that let it **write**, **append**, and **replace** content in your current note directly.

---

## 🏠 Local Web Server Mode

Start a fully self-contained web server with an SQLite database:

```bash
npx noteitdown local
# Or with custom settings:
NOTEITDOWN_PORT=8080 NOTEITDOWN_DB_PATH=./my-notes.db npx noteitdown local
```

- Serves the web app with a static file server on port **3721** (default)
- Stores notes in an **SQLite database** at `~/.noteitdown/notes.db` (default)
- Exposes a **REST API** at `/api/notes` for CRUD and full-text search
- The frontend auto-detects local mode and replaces Supabase sync with API calls
- A **LOCAL badge** appears in the header to indicate local mode

### REST API Endpoints

| Method | Endpoint | Description |
|-|-|-|
| `GET` | `/api/notes` | List notes (with optional `?search=`, `?limit=`, `?offset=`, `?content=`) |
| `GET` | `/api/notes/:id` | Get a single note by UUID (with optional `?line_start=`, `?line_limit=`) |
| `POST` | `/api/notes` | Create a new note |
| `PUT` | `/api/notes/:id` | Update an existing note |
| `DELETE` | `/api/notes/:id` | Delete a note |

#### List Notes with Search

Content is **truncated to ~300 characters** by default in list responses to keep responses compact. Use `?content=full` to get the complete content of every note.

```bash
# List all notes (content truncated to ~300 chars)
curl http://localhost:3721/api/notes

# Full-text search (LIKE on title and content)
curl http://localhost:3721/api/notes?search=recipe

# Get full content for all notes
curl 'http://localhost:3721/api/notes?content=full'

# Paginated
curl 'http://localhost:3721/api/notes?limit=10&offset=0'

# Combined
curl 'http://localhost:3721/api/notes?search=note&limit=5'
```

Response format (truncated content shows a preview hint):
```json
{
  "notes": [
    {
      "id": "uuid",
      "title": "My Note",
      "content": "Markdown content...\n\n_[+content truncated—full content available via single-note request]_\n",
      "tags": ["tag1", "tag2"],
      "created_at": "2026-07-16T12:00:00.000Z",
      "updated_at": "2026-07-16T12:30:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

#### Get a Single Note with Line Range

Fetch only a specific range of lines from a note — useful for very long notes:

```bash
# Get full note
curl http://localhost:3721/api/notes/<uuid>

# Get lines 1-50
curl 'http://localhost:3721/api/notes/<uuid>?line_start=0&line_limit=50'

# Get lines 100-150
curl 'http://localhost:3721/api/notes/<uuid>?line_start=100&line_limit=50'
```

Response with line range includes `_line_range` metadata:
```json
{
  "id": "uuid",
  "title": "My Note",
  "content": "Lines 100-150 content...",
  "tags": [],
  "created_at": "...",
  "updated_at": "...",
  "_line_range": {
    "start": 101,
    "end": 150,
    "total": 423
  }
}
```

#### Create a Note

```bash
curl -X POST http://localhost:3721/api/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","content":"**World**","tags":["demo"]}'
```

#### Update a Note

```bash
curl -X PUT http://localhost:3721/api/notes/<uuid> \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Title","content":"New content"}'
```

#### Delete a Note

```bash
curl -X DELETE http://localhost:3721/api/notes/<uuid>
```

### Environment Variables (Local Mode)

| Variable | Description | Default |
|-|-|-|
| `NOTEITDOWN_PORT` | Port for the local web server | `3721` |
| `NOTEITDOWN_DB_PATH` | Path to the SQLite database file | `~/.noteitdown/notes.db` |

---

## 📦 MCP Server

Note It Down includes a **full MCP server** that lets AI assistants (Claude Desktop, Cursor, etc.) read, create, update, search, and delete notes in your Supabase project.

### Quick Start

```bash
# Install globally (or use npx)
npm install -g noteitdown

# Run the interactive setup wizard (one-time)
noteitdown setup

# Start the MCP server (stdio transport)
noteitdown
```

### MCP Client Configuration

Configure Note It Down as an MCP server in your preferred AI client.

**Claude Desktop**

```json
{
  "mcpServers": {
    "noteitdown": {
      "command": "npx",
      "args": ["-y", "noteitdown"]
    }
  }
}
```

**Cursor**

```json
{
  "mcpServers": {
    "noteitdown": {
      "command": "npx",
      "args": ["-y", "noteitdown"]
    }
  }
}
```

**VS Code (GitHub Copilot Chat / MCP)**

```json
{
  "servers": {
    "noteitdown": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "noteitdown"]
    }
  }
}
```

### Environment Variables (MCP Mode)

| Variable | Description |
|-|-|
| `SUPABASE_URL` | Override the saved Supabase Project URL |
| `SUPABASE_KEY` | Override the saved Supabase Anon Key |
| `NOTEITDOWN_DEBUG` | Set to `true` to enable debug output with timestamps |

> **Tip:** Environment variables override the saved config file at `~/.noteitdown/config.json`.

### Tools

The server exposes **9 tools** for note management, protected by a built-in rate limiter (100 requests per 60-second window):

#### `list_notes`
List notes sorted by most recently updated, with **pagination support**.

```json
{
  "limit": 50,    // optional, default 50, max 100
  "offset": 0     // optional, default 0
}
```

#### `get_note`
Retrieve a single note by its UUID with optional line range for paginating through long notes.

```json
{
  "id": "uuid-here",
  "line_start": 0,       // optional, 0-based start line
  "line_limit": 50        // optional, max lines to return (1-500)
}
```

The response includes a `_lines: X–Y of Z_` indicator showing which lines were returned.
- Omit both params → full note content
- `line_start` only → returns from that line to the end
- `line_start` + `line_limit` → returns the exact slice (e.g., lines 51–100)

#### `create_note`
Create a new Markdown note.

```json
{
  "title": "My Note",
  "content": "Hello world",
  "tags": ["tag1", "tag2"]   // optional
}
```

#### `update_note`
Update an existing note's title, content, and/or tags.

```json
{
  "id": "uuid-here",
  "title": "New title",   // optional
  "content": "New body",  // optional
  "tags": ["new-tag"]     // optional
}
```

#### `delete_note`
Delete a note by its UUID. This action cannot be undone.

```json
{
  "id": "uuid-here"
}
```

#### `search_notes`
Search notes by free-text query across title and content (case-insensitive partial match).

```json
{
  "query": "search term"
}
```

#### `get_note_range`
Get multiple non-contiguous line ranges from a single note — ideal for reading specific sections of very long notes without loading the entire content. Overlapping or adjacent ranges are automatically merged.

```json
{
  "id": "uuid-here",
  "ranges": [
    { "line_start": 0, "line_end": 10 },
    { "line_start": 50, "line_end": 60 }
  ]
}
```

Each range is returned as a separate section with an `### Lines X–Y` heading. The response includes `_total lines` and `_returned` metadata. Max 50 ranges, max 1000 total lines.

#### `batch_delete_notes`
Delete multiple notes in a single operation.

```json
{
  "ids": ["uuid-1", "uuid-2"]
}
```

#### `health_check`
Verify the server is running and connected to Supabase. Takes no parameters.

### Resources

Notes are also exposed as **MCP resources**, allowing AI assistants to read note content directly:

| Resource URI | Description |
|-|-|
| `noteitdown://note/{id}` | Individual note in Markdown format |
| `noteitdown://notes` | Collection of all notes |

### Debug Logging

Enable verbose debug output to troubleshoot the server:

```bash
NOTEITDOWN_DEBUG=true noteitdown
```

All log and debug messages include ISO 8601 timestamps, e.g.:
```
[2026-07-15T12:00:00.000Z] [noteitdown] Server started
[2026-07-15T12:00:01.000Z] [noteitdown:debug] Listing notes: { limit: 50, offset: 0 }
```

### Setup Wizard

```bash
noteitdown setup
```

The setup wizard:
1. Validates your Supabase URL format (must be `https://*.supabase.co`)
2. Validates your Anon Key format (checks length ≥ 30 characters and contains a dot separator)
3. Probes the connection and detects if the `notes` table exists
4. Creates the table automatically (via direct Postgres connection or Supabase SQL API)
5. Saves configuration to `~/.noteitdown/config.json`

### Schema

The `notes` table schema shared by both the web app and MCP server:

| Column | Type | Notes |
|-|-|-|
| `id` | `uuid` | Primary key, default `gen_random_uuid()` |
| `title` | `text` | Note title (defaults to first line of content in the web app) |
| `content` | `text` | The Markdown body |
| `tags` | `text[]` | Optional list of tags |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Default `now()`, auto-refreshed on update |

Run `npx noteitdown setup` to create it automatically, or create it manually with the SQL below.

<details>
<summary><b>📋 SQL to create the table manually</b></summary>

```sql
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  content text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy "noteitdown_anon_all" on public.notes
  for all to anon
  using (true) with check (true);

create or replace function public.noteitdown_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger noteitdown_updated_at
  before update on public.notes
  for each row execute function public.noteitdown_set_updated_at();
```

</details>

---

## 🚀 Usage

```bash
npx noteitdown setup    # Configure Supabase credentials (one-time)
npx noteitdown local    # Start local web server with SQLite on port 3721
npx noteitdown          # Start MCP server (stdio) for AI assistants
npx noteitdown help     # Show usage and environment variable reference
```

---

## Customization

- Edit the styles in [`css/`](css/) (e.g. `variables.css` for colors and themes, `components.css` for components) to change the appearance
- Adjust the Markdown rendering by configuring [marked.js](https://marked.js.org) in [`js/preview.js`](js/preview.js)
- Change the autosave delay by editing the debounce timer in [`js/notes.js`](js/notes.js)

## Browser Support

Works in all modern browsers that support:
- localStorage
- ES6 JavaScript
- Fetch API (for API requests)

## Credits

- [marked.js](https://marked.js.org/) - Markdown parser
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite3 for Node.js
- [Supabase](https://supabase.com) - Open source Firebase alternative
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - Model Context Protocol

## License

MIT - Feel free to use, modify, and distribute.
