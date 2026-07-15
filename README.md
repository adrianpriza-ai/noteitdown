<div align="center">

# Note It Down

A responsive, offline-first Markdown notes web application with live preview, autosave, and optional Supabase synchronization — plus a **fully featured MCP (Model Context Protocol) server** for AI-driven note management.

<img src="https://adrianpriza-ai.github.io/note1.png" width="800" alt="Screenshot 1">

</div>

<details close>
  <summary><b>📸 More Screenshots</b></summary>
  <br>
  <img src="https://adrianpriza-ai.github.io/note2.png" width="800" alt="Screenshot 2">
  <br>
  <img src="https://adrianpriza-ai.github.io/note3.png" width="800" alt="Screenshot 3">
</details>

## Features

- ✍️ **Live Markdown Preview**: See your changes in real-time as you type
- 💾 **Autosave**: Notes automatically saved to localStorage (works offline)
- ☁️ **Optional Supabase Sync**: Sync notes to your own Supabase backend
- 📱 **Responsive Design**: Works on mobile, tablet, and desktop
- 🔖 **Sidebar Navigation**: Browse and select notes easily
- 🎨 **Formatting Toolbar**: Quick access to common Markdown formatting
- 🔒 **No Backend Required**: Uses Supabase as a backend-as-a-service
- 📝 **CRUD Operations**: Create, read, update, delete notes
- 🤖 **AI Chat with Tool Calling**: Chat with an AI that can read and edit your notes via tool calls (write, append, replace) using any OpenAI-compatible API
- 🧩 **MCP Server**: Exposes notes as resources and tools to AI assistants via the Model Context Protocol
- 🛡️ **Rate Limiting**: Built-in rate limiter (100 req/min) to prevent abuse
- 🔍 **Timestamps in Logs**: All log messages include ISO 8601 timestamps for easier debugging

---

## 🖥️ Web Application

### Getting Started

#### 1. Run the Application

You can use the hosted version online at [https://adrianpriza-ai.github.io/noteitdown/](https://adrianpriza-ai.github.io/noteitdown/), or run it locally:

Simply open `index.html` in any modern web browser:
- Double-click the file, or
- Run a local server: `python3 -m http.server 8080` and visit `http://localhost:8080`

#### 2. Optional Supabase Setup

To enable cloud synchronization:

1. Create a free project at [supabase.com](https://supabase.com)
2. Get your Project URL and anon key from Settings → API
3. Create the notes table (use the MCP setup command or the SQL above)
4. Click the ⚙️ Settings button in the app and enter your URL and key

#### 3. Optional AI Chat Setup

To enable the AI chat with note editing:

1. Open Settings → AI Chat
2. Toggle **Enable AI Chat** on
3. Enter your OpenAI-compatible API endpoint and API key
4. Click **Refresh Models** to load available models
5. Select your preferred model

The AI has access to tools that let it **write**, **append**, and **replace** content in your current note directly.

### How It Works

1. **Offline First**: Notes are immediately saved to browser's localStorage
2. **Live Preview**: Markdown is rendered in real-time using [marked.js](https://marked.js.org)
3. **Autosave**: Changes are saved after a 1-second delay (debounced)
4. **Shared Supabase Table**: When configured, notes are synchronized to the *same* `notes` table the MCP server uses — both ways. On startup the app pulls notes from Supabase (so notes created via MCP appear here), and on every edit it pushes changes back.
5. **Conflict Resolution**: Uses last-write-wins strategy based on `updated_at` timestamps

---

## 📦 MCP Server

Note It Down includes a **full MCP server** that lets AI assistants (Claude, etc.) read, create, update, search, and delete notes in your Supabase project.

### Quick Start

```bash
# Install globally (or use npx)
npm install -g noteitdown

# Run the interactive setup wizard
noteitdown setup

# Start the MCP server (stdio transport)
noteitdown
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Override the saved Supabase Project URL |
| `SUPABASE_KEY` | Override the saved Supabase Anon Key |
| `NOTEITDOWN_DEBUG` | Set to `true` to enable debug output with timestamps |

> **Tip:** Environment variables override the saved config file at `~/.noteitdown/config.json`.

### Tools

The server exposes **8 tools** for note management, protected by a built-in rate limiter (100 requests per 60-second window):

#### `list_notes`
List notes sorted by most recently updated, with **pagination support**.

```json
{
  "limit": 50,    // optional, default 50, max 100
  "offset": 0     // optional, default 0
}
```

Returns notes in Markdown format with a total count header.

#### `get_note`
Retrieve a single note by its UUID.

```json
{
  "id": "uuid-here"    // required
}
```

Returns the note content in Markdown with metadata (id, tags, timestamps).

#### `create_note`
Create a new Markdown note.

```json
{
  "title": "My Note",       // required
  "content": "Hello world", // required
  "tags": ["tag1", "tag2"]  // optional
}
```

Returns the created note with generated UUID and timestamps.

#### `update_note`
Update an existing note's title, content, and/or tags.

```json
{
  "id": "uuid-here",     // required
  "title": "New title",  // optional
  "content": "New body", // optional
  "tags": ["new-tag"]    // optional
}
```

Provide at least one field to update. Returns the updated note.

#### `delete_note`
Delete a note by its UUID. This action cannot be undone.

```json
{
  "id": "uuid-here"    // required
}
```

#### `search_notes`
Search notes by free-text query across title and content (case-insensitive partial match).

```json
{
  "query": "search term"    // required
}
```

Returns matching notes sorted by last updated.

#### `health_check`
Verify the server is running and connected to Supabase. Takes no parameters.

Returns a status message including the server version, e.g. `✅ noteitdown MCP server v1.0.0 is healthy and connected to Supabase.`

#### `batch_delete_notes`
Delete multiple notes in a single operation.

```json
{
  "ids": ["uuid-1", "uuid-2"]    // required
}
```

Returns a confirmation with the count of deleted notes.

### Resources

Notes are also exposed as **MCP resources**, allowing AI assistants to read note content directly:

| Resource URI | Description |
|---|---|
| `noteitdown://note/{id}` | Individual note in Markdown format |
| `noteitdown://notes` | Collection of all notes |

Clients can access notes via the standard resource protocol, e.g. `mcp://noteitdown/note/{id}`.

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

Debug logs are prefixed with `[noteitdown:debug]`, regular logs with `[noteitdown]`, and written to stderr.

### Setup Command

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
|--------|------|-------|
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

### Rate Limiting

The MCP server includes a built-in in-memory rate limiter to prevent abuse:

- **100 requests per 60-second window** (configurable)
- Applied across all tool handlers (`list_notes`, `get_note`, `create_note`, etc.)
- Returns a descriptive error when the limit is exceeded
- Per-operation and per-session rate limiting can be added by specifying different keys

---

## Browser Support

Works in all modern browsers that support:
- localStorage
- ES6 JavaScript
- Fetch API (for Supabase requests)

## Customization

- Modify `style.css` to change the appearance
- Adjust marked.js options in `script.js` for different Markdown behavior
- Change the autosave delay by modifying the `DELAY` constant in `script.js`

## Credits

- [marked.js](https://marked.js.org/) - Markdown parser
- [Supabase](https://supabase.com) - Open source Firebase alternative
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - Model Context Protocol

## License

MIT - Feel free to use, modify, and distribute.
