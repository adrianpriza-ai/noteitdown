# Note It Down

A responsive, offline-first Markdown notes web application with live preview, autosave, and optional Supabase synchronization.

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

## Getting Started

### 1. Run the Application

You can use the hosted version online at [https://adrianpriza-ai.github.io/noteitdown/](https://adrianpriza-ai.github.io/noteitdown/), or run it locally:

Simply open `index.html` in any modern web browser:
- Double-click the file, or
- Run a local server: `python3 -m http.server 8080` and visit `http://localhost:8080`

### 2. Optional Supabase Setup

To enable cloud synchronization:

1. Create a free project at [supabase.com](https://supabase.com)
2. Get your Project URL and anon key from Settings → API
3. Create the notes table (see below)
4. Click the ⚙️ Settings button in the app and enter your URL and key

#### Supabase Table Setup

The web app and the **noteitdown MCP server** share the *exact same* `notes`
table and schema, so a note created in one is visible in the other. Both use:

| column       | type                     | notes                          |
|--------------|--------------------------|--------------------------------|
| `id`         | `uuid`                   | primary key, default `gen_random_uuid()` |
| `title`      | `text`                   | note title (defaults to first line of content in the web app) |
| `content`    | `text`                   | the Markdown body              |
| `tags`       | `text[]`                 | optional list of tags          |
| `created_at` | `timestamptz`            | default `now()`                |
| `updated_at` | `timestamptz`            | default `now()`, refreshed on update |

**Recommended:** create the table automatically with the MCP server's setup
command, which applies the schema below, enables Row Level Security, adds a
policy so the anon key can read/write, and sets an `updated_at` trigger:

```bash
npx noteitdown setup
```

Or run this SQL manually in the Supabase SQL editor:

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


### 3. Optional AI Chat Setup

To enable the AI chat with note editing:

1. Open Settings → AI Chat
2. Toggle **Enable AI Chat** on
3. Enter your OpenAI-compatible API endpoint and API key
4. Click **Refresh Models** to load available models
5. Select your preferred model

The AI has access to tools that let it **write**, **append**, and **replace** content in your current note directly.

## How It Works

1. **Offline First**: Notes are immediately saved to browser's localStorage
2. **Live Preview**: Markdown is rendered in real-time using [marked.js](https://marked.js.org)
3. **Autosave**: Changes are saved after a 1-second delay (debounced)
4. **Shared Supabase Table**: When configured, notes are synchronized to the *same* `notes` table the noteitdown MCP server uses — both ways. On startup the app pulls notes from Supabase (so notes created via MCP appear here), and on every edit it pushes changes back.
5. **Conflict Resolution**: Uses last-write-wins strategy based on `updated_at` timestamps

## File Structure

- `index.html` - Main HTML structure
- `style.css` - Styling and responsive design
- `script.js` - Application logic (Markdown rendering, storage, Supabase sync)
- `README.md` - This file

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

## License

MIT - Feel free to use, modify, and distribute.
