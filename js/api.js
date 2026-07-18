// ─── Local Web Server API Client ─────────────────────────────────────────────
// Used when the app is served from the NoteItDown local server (port 3721).

const API_BASE = '/api';

/**
 * Generic API request helper.
 */
async function apiRequest(method, path, body) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${path}`, options);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

/** GET /api/notes?search=&limit=&offset=&content= */
async function apiListNotes(search) {
    let path = '/notes';
    const params = ['content=full'];  // request full content for the editor
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (params.length) path += '?' + params.join('&');
    return apiRequest('GET', path);
}

/** GET /api/notes/:id */
async function apiGetNote(id) {
    return apiRequest('GET', `/notes/${encodeURIComponent(id)}`);
}

/** POST /api/notes */
async function apiCreateNote(note) {
    return apiRequest('POST', '/notes', note);
}

/** PUT /api/notes/:id */
async function apiUpdateNote(id, data) {
    return apiRequest('PUT', `/notes/${encodeURIComponent(id)}`, data);
}

/** DELETE /api/notes/:id */
async function apiDeleteNote(id) {
    return apiRequest('DELETE', `/notes/${encodeURIComponent(id)}`);
}

// ─── Bulk sync helpers ───────────────────────────────────────────────────────

/**
 * Fetch notes from the local API and merge them into `state.notes`.
 * When a `search` query is provided, the API performs server-side
 * full-text search (LIKE on title + content).
 * Existing local notes that have a newer `updatedAt` win over API data.
 */
async function loadFromLocalApi(search) {
    try {
        const result = await apiListNotes(search);
        const apiNotes = result.notes || [];
        const apiNotesMap = new Map(apiNotes.map(n => [n.id, n]));

        // 1. Merge remote notes into local state
        for (const note of apiNotes) {
            const existing = state.notes[note.id];
            const remoteTime = new Date(note.updated_at).getTime();
            const localTime = existing ? new Date(existing.updatedAt).getTime() : 0;

            if (!existing || remoteTime >= localTime) {
                state.notes[note.id] = normalizeNote({
                    title: note.title || '',
                    content: note.content || '',
                    tags: note.tags || [],
                    updatedAt: note.updated_at,
                    createdAt: note.created_at,
                });
            }
        }

        // 2. Identify local notes that need to be uploaded to API
        // (i.e. not in API, or local is strictly newer than API)
        const notesToUpload = [];
        for (const [id, note] of Object.entries(state.notes)) {
            const remote = apiNotesMap.get(id);
            if (!remote) {
                notesToUpload.push(id);
            } else {
                const remoteTime = new Date(remote.updated_at).getTime();
                const localTime = new Date(note.updatedAt).getTime();
                if (localTime > remoteTime) {
                    notesToUpload.push(id);
                }
            }
        }

        // Upload them
        if (notesToUpload.length > 0) {
            updateSyncStatus(`Syncing ${notesToUpload.length} note(s)...`, 'info');
            for (const id of notesToUpload) {
                await syncNoteToLocalApi(id);
            }
            updateSyncStatus('Synced with local database', 'success');
        }

        // Ensure an active note is set
        const noteIds = Object.keys(state.notes);
        if (noteIds.length > 0 && !state.activeNoteId) {
            state.activeNoteId = noteIds[0];
        }

        if (search) {
            updateStatus(`Found ${apiNotes.length} matching note${apiNotes.length !== 1 ? 's' : ''}`, 'info');
        } else {
            updateStatus('Loaded notes from local database', 'success');
        }
        renderNotesList();
        loadActiveNote();
    } catch (e) {
        console.error('Error loading from local API:', e);
        updateStatus('Failed to load from local server — using local storage', 'error');

        // Fall back to whatever is in state (from localStorage)
        renderNotesList();
        loadActiveNote();
    }
}

/** Upsert a single note to the local API. */
async function syncNoteToLocalApi(noteId) {
    const note = state.notes[noteId];
    if (!note) return;
    if (typeof isSyncThrottled === 'function' && isSyncThrottled()) return;

    try {
        await apiUpdateNote(noteId, {
            title: deriveTitle(note) || 'Untitled',
            content: note.content || '',
            tags: note.tags || [],
            created_at: note.createdAt,
            updated_at: note.updatedAt,
        });
        updateSyncStatus('Saved to local database', 'success');
    } catch (e) {
        console.error('Error syncing note to API:', e);
        updateSyncStatus('Failed to save to local database', 'error');
    }
}

/** Push all local notes to the API, creating or updating each one. */
async function syncAllNotesToLocalApi() {
    const ids = Object.keys(state.notes);
    for (const id of ids) {
        await syncNoteToLocalApi(id);
    }
    updateSyncStatus('All notes saved locally', 'success');
}

/** Delete a note from the local API. */
async function deleteNoteFromLocalApi(noteId) {
    try {
        await apiDeleteNote(noteId);
    } catch (e) {
        console.error('Error deleting note via API:', e);
    }
}
