// ─── Sync Limiter Config ────────────────────────────────────────────────────

let lastSyncTime = 0;
let syncIntervalMs = 2000; // default 2 seconds

function loadSyncConfig() {
    const stored = localStorage.getItem('syncInterval');
    const seconds = stored !== null ? parseInt(stored, 10) : 2;
    syncIntervalMs = seconds * 1000;

    if (elements.syncInterval) {
        elements.syncInterval.value = String(seconds);
    }
    if (elements.syncIntervalValue) {
        elements.syncIntervalValue.textContent = seconds > 0 ? seconds + 's' : 'Off';
    }
}

function saveSyncConfig() {
    const seconds = parseInt(elements.syncInterval?.value || '2', 10);
    localStorage.setItem('syncInterval', String(seconds));
    syncIntervalMs = seconds * 1000;
}

/**
 * Returns true if the sync should be skipped (throttled).
 */
function isSyncThrottled() {
    if (syncIntervalMs <= 0) return false;
    const now = Date.now();
    if (now - lastSyncTime < syncIntervalMs) return true;
    lastSyncTime = now;
    return false;
}

function updateSyncIntervalDisplay() {
    if (elements.syncInterval && elements.syncIntervalValue) {
        const seconds = parseInt(elements.syncInterval.value, 10);
        elements.syncIntervalValue.textContent = seconds > 0 ? seconds + 's' : 'Off';
    }
}

// ─── Settings UI ────────────────────────────────────────────────────────────

function openSettings() {
    elements.supabaseUrl.value = localStorage.getItem('supabaseUrl') || '';
    elements.anonKey.value = localStorage.getItem('anonKey') || '';
    elements.aiEndpoint.value = localStorage.getItem('aiEndpoint') || '';
    elements.aiApiKey.value = localStorage.getItem('aiApiKey') || '';
    elements.connectionMessage.className = 'message';
    elements.connectionMessage.style.display = 'none';
    elements.aiConfigMessage.style.display = 'none';
    const aiEnabled = localStorage.getItem('aiEnabled') === 'true';
    state.isAiEnabled = aiEnabled;
    if (elements.aiEnableToggle) {
        elements.aiEnableToggle.classList.toggle('active', aiEnabled);
    }
    if (elements.aiConfigSection) {
        elements.aiConfigSection.classList.toggle('hidden', !aiEnabled);
    }

    // Keep Supabase section visible so users can toggle cloud sync
    const supabaseSection = document.getElementById('supabaseSection');
    if (supabaseSection) {
        supabaseSection.style.display = 'block';
    }

    // Load sync interval config
    loadSyncConfig();

    elements.settingsModal.classList.add('active');
}

function closeSettings() {
    elements.settingsModal.classList.remove('active');
}

async function saveSettings() {
    const url = elements.supabaseUrl.value.trim();
    const key = elements.anonKey.value.trim();

    saveAIConfig();
    loadAIConfig();
    saveSyncConfig();

    if (url && key) {
        localStorage.setItem('supabaseUrl', url);
        localStorage.setItem('anonKey', key);

        const { ok, reason } = await initSupabase(url, key);

        if (ok) {
            state.isSyncEnabled = true;
            showMessage('Connected to Supabase!', 'success');
            updateSyncStatus('Connected', 'success');

            setTimeout(async () => {
                closeSettings();
                await loadFromSupabase();
            }, 1500);
            return;
        } else {
            showMessage(reason || 'Failed to connect', 'error');
            return;
        }
    }

    if (!url && !key) {
        clearSync();
        closeSettings();
        return;
    }

    showMessage('Please enter both URL and Key', 'error');
}

async function testConnection() {
    const url = elements.supabaseUrl.value.trim();
    const key = elements.anonKey.value.trim();

    if (!url || !key) {
        showMessage('Please enter both URL and Key', 'error');
        return;
    }

    showMessage('Testing connection…', 'info');

    const { ok, reason } = await initSupabase(url, key);

    if (ok) {
        showMessage('Connection successful!', 'success');
    } else {
        showMessage(reason || 'Connection failed', 'error');
    }
}

function clearSync() {
    localStorage.removeItem('supabaseUrl');
    localStorage.removeItem('anonKey');
    state.supabaseClient = null;
    state.isSyncEnabled = false;
    elements.supabaseUrl.value = '';
    elements.anonKey.value = '';
    showMessage('Sync cleared', 'info');
    updateSyncStatus('', '');
    lastSyncTime = 0;
}

function showMessage(text, type) {
    elements.connectionMessage.textContent = text;
    elements.connectionMessage.className = `message ${type}`;
    elements.connectionMessage.style.display = 'block';
}

function handleGlobalKeydown(e) {
    if (e.key === 'Escape') {
        closeSettings();
    }
}

function loadSupabaseConfig() {
    const url = localStorage.getItem('supabaseUrl');
    const key = localStorage.getItem('anonKey');

    if (url && key) {
        initSupabase(url, key).then(async ({ ok, reason }) => {
            if (ok) {
                state.isSyncEnabled = true;
                updateSyncStatus('Connected', 'success');
                await loadFromSupabase();
            } else {
                console.warn('Auto-connect failed:', reason);
                updateSyncStatus('Sync unavailable', 'error');
            }
        });
    }
}

async function initSupabase(url, key) {
    try {
        // Validate URL format before even trying
        let parsedUrl;
        try { parsedUrl = new URL(url); } catch (_) {
            return { ok: false, reason: 'Invalid URL format' };
        }
        if (!parsedUrl.hostname.includes('.')) {
            return { ok: false, reason: 'URL does not look like a valid Supabase project URL' };
        }

        // Use the UMD build which sets window.supabase globally.
        // The bare package entry is ESM-only and does NOT set window.supabase.
        if (!window.supabase) {
            await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');
        }

        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            return { ok: false, reason: 'Failed to load Supabase library — check your internet connection' };
        }

        state.supabaseClient = window.supabase.createClient(url, key);

        const { error } = await state.supabaseClient
            .from('notes')
            .select('id')
            .limit(1);

        if (error) {
            console.error('Supabase error:', error);
            if (error.code === '42P01') {
                return { ok: false, reason: 'The `notes` table does not exist — create it in your Supabase project first' };
            }
            if (error.code === 'PGRST301' || error.message?.toLowerCase().includes('jwt')) {
                return { ok: false, reason: 'Invalid API key — check your anon key' };
            }
            if (error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network')) {
                return { ok: false, reason: 'Network error — check your project URL and internet connection' };
            }
            return { ok: false, reason: `Supabase error: ${error.message || error.code}` };
        }

        return { ok: true };
    } catch (e) {
        console.error('Failed to init Supabase:', e);
        const msg = e?.message || String(e);
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            return { ok: false, reason: 'Network error — is the Supabase URL correct?' };
        }
        return { ok: false, reason: `Error: ${msg}` };
    }
}

async function syncNoteToSupabase(noteId) {
    if (!state.supabaseClient || !state.notes[noteId]) return;
    if (isSyncThrottled()) return;

    try {
        const note = state.notes[noteId];
        const { error } = await state.supabaseClient
            .from('notes')
            .upsert({
                id: noteId,
                title: deriveTitle(note),
                content: note.content || '',
                tags: Array.isArray(note.tags) ? note.tags : [],
                created_at: note.createdAt || note.updatedAt,
                updated_at: note.updatedAt
            }, { onConflict: 'id' });

        if (error) {
            console.error('Supabase upsert error:', error);
            updateSyncStatus('Sync failed', 'error');
        } else {
            updateSyncStatus('Synced to cloud', 'success');
        }
    } catch (e) {
        console.error('Sync error:', e);
        updateSyncStatus('Sync failed', 'error');
    }
}

async function syncAllNotes() {
    if (!state.supabaseClient) return;

    try {
        const promises = Object.keys(state.notes).map(id => {
            const note = state.notes[id];
            return state.supabaseClient
                .from('notes')
                .upsert({
                    id: id,
                    title: deriveTitle(note),
                    content: note.content || '',
                    tags: Array.isArray(note.tags) ? note.tags : [],
                    created_at: note.createdAt || note.updatedAt,
                    updated_at: note.updatedAt
                }, { onConflict: 'id' });
        });

        const results = await Promise.all(promises);
        const failed = results.filter(r => r.error);
        if (failed.length > 0) {
            console.error('Some notes failed to sync:', failed.map(r => r.error));
            updateSyncStatus(`${failed.length} note(s) failed to sync`, 'error');
        } else {
            updateSyncStatus('All notes synced', 'success');
        }
    } catch (e) {
        console.error('Sync all error:', e);
        updateSyncStatus('Sync failed', 'error');
    }
}

async function loadFromSupabase() {
    if (!state.supabaseClient) return;
    try {
        const { data, error } = await state.supabaseClient
            .from('notes')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Load error:', error);
            updateStatus('Failed to load from Supabase', 'error');
            return;
        }

        // Track which local-only notes need to be pushed up
        const localOnlyIds = new Set(Object.keys(state.notes));

        for (const row of (data || [])) {
            localOnlyIds.delete(row.id);
            const existing = state.notes[row.id];
            const remoteTime = new Date(row.updated_at).getTime();
            const localTime = existing ? new Date(existing.updatedAt).getTime() : 0;
            if (!existing || remoteTime >= localTime) {
                state.notes[row.id] = normalizeNote({
                    title: row.title || '',
                    content: row.content || '',
                    tags: row.tags || [],
                    updatedAt: row.updated_at,
                    createdAt: row.created_at
                });
                if (state.isLocalMode) {
                    await syncNoteToLocalApi(row.id);
                }
            } else if (localTime > remoteTime) {
                await syncNoteToSupabase(row.id);
            }
        }

        // Only push notes that exist locally but not yet in the cloud
        // (avoids overwriting newer cloud data with stale local data)
        for (const id of localOnlyIds) {
            await syncNoteToSupabase(id);
        }

        saveState();
        renderNotesList();

        if (!state.activeNoteId || !state.notes[state.activeNoteId]) {
            const ids = Object.keys(state.notes);
            state.activeNoteId = ids.length ? ids[0] : null;
        }
        loadActiveNote();
        updateStatus('Synced with cloud', 'success');
    } catch (e) {
        console.error('Load from Supabase error:', e);
        updateStatus('Supabase sync error', 'error');
    }
}

async function deleteNoteFromSupabase(noteId) {
    if (!state.supabaseClient) return;
    try {
        await state.supabaseClient.from('notes').delete().eq('id', noteId);
    } catch (e) {
        console.error('Delete sync error:', e);
    }
}

function loadAIConfig() {
    const enabled = localStorage.getItem('aiEnabled');
    const endpoint = localStorage.getItem('aiEndpoint');
    const apiKey = localStorage.getItem('aiApiKey');

    state.isAiEnabled = enabled === 'true';

    if (state.isAiEnabled) {
        elements.aiEnableToggle?.classList.add('active');
        elements.aiChatToggleBtn?.classList.remove('hidden');
        elements.aiConfigSection?.classList.remove('hidden');
    } else {
        elements.aiChatToggleBtn?.classList.add('hidden');
        elements.aiConfigSection?.classList.add('hidden');
    }

    if (endpoint) elements.aiEndpoint.value = endpoint;
    if (apiKey) elements.aiApiKey.value = apiKey;

    populateModelSelect();
}

function saveAIConfig() {
    localStorage.setItem('aiEnabled', state.isAiEnabled);
    localStorage.setItem('aiEndpoint', elements.aiEndpoint.value.trim());
    localStorage.setItem('aiApiKey', elements.aiApiKey.value.trim());
    if (elements.aiModelSelect) {
        localStorage.setItem('aiModel', elements.aiModelSelect.value);
    }
}

function toggleAIEnable() {
    state.isAiEnabled = !state.isAiEnabled;
    elements.aiEnableToggle?.classList.toggle('active', state.isAiEnabled);
    elements.aiChatToggleBtn?.classList.toggle('hidden', !state.isAiEnabled);
    elements.aiConfigSection?.classList.toggle('hidden', !state.isAiEnabled);
    localStorage.setItem('aiEnabled', state.isAiEnabled);

    if (!state.isAiEnabled) {
        closeAiChat();
    }
}

async function fetchModels() {
    const endpoint = elements.aiEndpoint.value.trim();
    const apiKey = elements.aiApiKey.value.trim();

    if (!endpoint || !apiKey) {
        showAiMessage('Please enter endpoint and API key', 'error');
        return;
    }

    showAiMessage('Fetching models...', 'info');

    try {
        const response = await fetch(`${endpoint}/models`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const models = data.data || [];

        if (models.length > 0) {
            localStorage.setItem('aiModels', JSON.stringify(models));
            populateModelSelect();
            showAiMessage(`Loaded ${models.length} models`, 'success');
        } else {
            showAiMessage('No models found', 'error');
        }
    } catch (e) {
        showAiMessage('Failed to fetch models: ' + e.message, 'error');
    }
}

function populateModelSelect() {
    if (!elements.aiModelSelect) return;
    const savedModel = localStorage.getItem('aiModel');
    const modelsJson = localStorage.getItem('aiModels');
    const models = modelsJson ? JSON.parse(modelsJson) : [];

    elements.aiModelSelect.innerHTML = '';

    if (models.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No models loaded';
        opt.disabled = true;
        elements.aiModelSelect.appendChild(opt);
        return;
    }

    models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.id;
        if (m.id === savedModel || (!savedModel && !elements.aiModelSelect.hasChildNodes())) {
            opt.selected = true;
        }
        elements.aiModelSelect.appendChild(opt);
    });

    if (!savedModel && models.length > 0) {
        elements.aiModelSelect.value = models[0].id;
        localStorage.setItem('aiModel', models[0].id);
    }
}

function showAiMessage(text, type) {
    elements.aiConfigMessage.textContent = text;
    elements.aiConfigMessage.className = `message ${type}`;
    elements.aiConfigMessage.style.display = 'block';

    setTimeout(() => {
        elements.aiConfigMessage.style.display = 'none';
    }, 5000);
}

const noteEditingTools = [
    {
        type: 'function',
        function: {
            name: 'write_note',
            description: 'Write content to the current note, replacing all existing content.',
            parameters: {
                type: 'object',
                properties: {
                    content: {
                        type: 'string',
                        description: 'The full markdown content to write to the note.'
                    }
                },
                required: ['content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'append_to_note',
            description: 'Append text to the end of the current note.',
            parameters: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'The markdown text to append.'
                    }
                },
                required: ['text']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'replace_in_note',
            description: 'Find and replace text in the current note (first occurrence).',
            parameters: {
                type: 'object',
                properties: {
                    old_text: {
                        type: 'string',
                        description: 'The exact text to find.'
                    },
                    new_text: {
                        type: 'string',
                        description: 'The text to replace with.'
                    }
                },
                required: ['old_text', 'new_text']
            }
        }
    }
];

function toggleAiChat() {
    if (!state.isAiEnabled) return;
    state.isAiChatOpen = !state.isAiChatOpen;
    elements.aiChatPanel?.classList.toggle('hidden', !state.isAiChatOpen);
    elements.aiChatToggleBtn?.classList.toggle('active', state.isAiChatOpen);
}

function closeAiChat() {
    state.isAiChatOpen = false;
    elements.aiChatPanel?.classList.add('hidden');
    elements.aiChatToggleBtn?.classList.remove('active');
}

// ─── Thinking Indicator ──────────────────────────────────────────────────────

function addThinkingIndicator() {
    const div = document.createElement('div');
    div.className = 'ai-thinking';
    div.id = 'aiThinkingIndicator';
    div.innerHTML = `
        <span>Thinking</span>
        <span class="ai-thinking-dots">
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
            <span class="ai-thinking-dot"></span>
        </span>
    `;
    elements.aiChatMessages?.appendChild(div);
    scrollAiChatToBottom();
}

function removeThinkingIndicator() {
    const el = document.getElementById('aiThinkingIndicator');
    if (el) el.remove();
}

// ─── Reasoning Block ────────────────────────────────────────────────────────

function addReasoningBlock(reasoningText) {
    const div = document.createElement('div');
    div.className = 'ai-reasoning';

    div.innerHTML = `
        <button class="ai-reasoning-toggle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span>Thinking</span>
        </button>
        <div class="ai-reasoning-content">${escapeHtml(reasoningText)}</div>
    `;

    const toggle = div.querySelector('.ai-reasoning-toggle');
    const content = div.querySelector('.ai-reasoning-content');
    toggle.addEventListener('click', () => {
        toggle.classList.toggle('open');
        content.classList.toggle('open');
    });

    elements.aiChatMessages?.appendChild(div);
    scrollAiChatToBottom();
}

// ─── Tool Call Message ──────────────────────────────────────────────────────

/**
 * Adds a tool call card to the chat messages.
 * @param {string} id - Unique ID for this tool call element
 * @param {string} name - Tool name (e.g. "write_note")
 * @param {object} args - Tool arguments
 * @param {string} status - "running" | "success" | "error"
 * @param {string} [resultMsg] - Optional result message for success/error
 */
function addToolCallMessage(id, name, args, status, resultMsg) {
    const container = document.getElementById(id);

    if (container) {
        // Update existing element
        updateToolCallElement(container, name, args, status, resultMsg);
        return;
    }

    const div = document.createElement('div');
    div.className = 'ai-tool-call';
    div.id = id;

    const argsStr = JSON.stringify(args, null, 2);
    const toolIcon = getToolIcon(name);

    const statusLabel = status === 'running' ? 'Running...'
        : status === 'success' ? 'Done'
        : 'Failed';

    div.innerHTML = `
        <div class="ai-tool-call-header ${status === 'running' ? 'running' : ''}">
            <span class="tool-call-icon">${toolIcon}</span>
            <span class="tool-call-name">${escapeHtml(name)}</span>
            <span class="tool-call-status">
                ${status === 'running' ? '<span class="tool-call-spinner"></span>' : ''}
                ${statusLabel}
            </span>
            <svg class="tool-call-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        </div>
        <div class="ai-tool-call-body">
            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">Arguments:</div>
            <div class="ai-tool-call-args">${escapeHtml(argsStr)}</div>
            ${status !== 'running'
                ? `<div class="ai-tool-call-result ${status === 'success' ? 'success' : 'error'}">${escapeHtml(resultMsg || (status === 'success' ? 'Tool executed successfully' : 'Tool execution failed'))}</div>`
                : ''}
        </div>
    `;

    // Toggle body visibility
    const header = div.querySelector('.ai-tool-call-header');
    const body = div.querySelector('.ai-tool-call-body');
    header.addEventListener('click', () => {
        header.classList.toggle('open');
        body.classList.toggle('open');
    });

    // Auto-open on first creation
    header.classList.add('open');
    body.classList.add('open');

    elements.aiChatMessages?.appendChild(div);
    scrollAiChatToBottom();
}

function updateToolCallElement(container, name, args, status, resultMsg) {
    const header = container.querySelector('.ai-tool-call-header');
    const statusEl = header.querySelector('.tool-call-status');
    const body = container.querySelector('.ai-tool-call-body');

    // Update status
    header.classList.toggle('running', status === 'running');
    header.classList.remove('open');

    const statusLabel = status === 'running' ? 'Running...'
        : status === 'success' ? 'Done'
        : 'Failed';

    statusEl.innerHTML = `
        ${status === 'running' ? '<span class="tool-call-spinner"></span>' : ''}
        ${statusLabel}
    `;

    // Update or add result
    let resultEl = container.querySelector('.ai-tool-call-result');
    if (status !== 'running') {
        if (!resultEl) {
            resultEl = document.createElement('div');
            resultEl.className = `ai-tool-call-result ${status === 'success' ? 'success' : 'error'}`;
            body.appendChild(resultEl);
        } else {
            resultEl.className = `ai-tool-call-result ${status === 'success' ? 'success' : 'error'}`;
        }
        resultEl.textContent = resultMsg || (status === 'success' ? 'Tool executed successfully' : 'Tool execution failed');
    } else if (resultEl) {
        resultEl.remove();
    }
}

function getToolIcon(name) {
    const icons = {
        'write_note': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        'append_to_note': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        'replace_in_note': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>'
    };
    return icons[name] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
}

function scrollAiChatToBottom() {
    if (elements.aiChatMessages) {
        elements.aiChatMessages.scrollTop = elements.aiChatMessages.scrollHeight;
    }
}

// ─── Send & Display AI Messages ─────────────────────────────────────────────

async function sendAiMessage() {
    const message = elements.aiChatInput.value.trim();
    if (!message) return;

    const endpoint = elements.aiEndpoint.value.trim();
    const apiKey = elements.aiApiKey.value.trim();
    const model = elements.aiModelSelect?.value || 'gpt-4o-mini';

    if (!endpoint || !apiKey) {
        showAiMessage('Please configure AI in settings', 'error');
        return;
    }

    const userMessage = { role: 'user', content: message };
    addAiMessage(userMessage);
    elements.aiChatInput.value = '';

    const currentNote = state.activeNoteId ? state.notes[state.activeNoteId] : null;
    const noteContent = currentNote ? currentNote.content : '';

    const systemPrompt = `You are a helpful AI assistant helping the user with their markdown notes. You have access to tools to edit the note when the user asks you to make changes. The current note content is:\n\n${noteContent || '(No note selected)'}`;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...getAiMessages(),
        userMessage
    ];

    // Show thinking indicator
    addThinkingIndicator();

    try {
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.7,
                tools: noteEditingTools
            })
        });

        // Remove thinking indicator
        removeThinkingIndicator();

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const choice = data.choices[0];
        const assistantMessage = choice?.message;

        if (!assistantMessage) return;

        // Check for reasoning/thinking content (used by DeepSeek, etc.)
        const reasoningContent = assistantMessage.reasoning_content
            || assistantMessage.reasoning
            || data.reasoning_content
            || null;

        if (reasoningContent && reasoningContent.trim()) {
            addReasoningBlock(reasoningContent);
        }

        // Handle tool calls
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            for (const toolCall of assistantMessage.tool_calls) {
                const fn = toolCall.function;
                let args;
                try {
                    args = JSON.parse(fn.arguments);
                } catch (e) {
                    addToolCallMessage(toolCall.id, fn.name, { _parseError: fn.arguments }, 'error', 'Failed to parse arguments');
                    continue;
                }

                // Show the tool call as running
                addToolCallMessage(toolCall.id, fn.name, args, 'running');

                try {
                    await executeToolCall(fn.name, args);
                    // Update to success
                    addToolCallMessage(toolCall.id, fn.name, args, 'success', 'Tool executed successfully');
                } catch (e) {
                    addToolCallMessage(toolCall.id, fn.name, args, 'error', e.message);
                }
            }
        }

        // Show assistant's text response after tool calls (if any)
        if (assistantMessage.content && assistantMessage.content.trim()) {
            addAiMessage(assistantMessage);
        } else if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
            // If no tool calls and no content, show a fallback
            addAiMessage({ role: 'assistant', content: '...' });
        }
    } catch (e) {
        removeThinkingIndicator();
        addAiMessage({ role: 'system', content: `Error: ${e.message}` });
    }
}

function addAiMessage(message) {
    const div = document.createElement('div');
    div.className = `ai-message ai-message-${message.role}`;
    const content = document.createElement('div');
    content.className = 'ai-message-content';

    if (message.role === 'user') {
        // Escape user message to prevent HTML injection
        content.textContent = message.content || '';
    } else {
        content.innerHTML = marked.parse(message.content || '');
    }

    div.appendChild(content);
    elements.aiChatMessages?.appendChild(div);
    scrollAiChatToBottom();
}

function getAiMessages() {
    const msgs = [];
    if (elements.aiChatMessages) {
        elements.aiChatMessages.querySelectorAll(':scope > .ai-message').forEach(el => {
            const role = el.classList.contains('ai-message-user') ? 'user' :
                         el.classList.contains('ai-message-assistant') ? 'assistant' : 'system';
            const contentEl = el.querySelector('.ai-message-content');
            msgs.push({ role, content: contentEl ? contentEl.textContent : '' });
        });
    }
    return msgs;
}

function executeToolCall(name, args) {
    const noteId = state.activeNoteId;
    if (!noteId || !state.notes[noteId]) {
        throw new Error('No active note.');
    }

    switch (name) {
        case 'write_note':
            state.notes[noteId].content = args.content;
            break;
        case 'append_to_note':
            state.notes[noteId].content += '\n' + args.text;
            break;
        case 'replace_in_note':
            state.notes[noteId].content = state.notes[noteId].content.replace(args.old_text, args.new_text);
            break;
        default:
            throw new Error(`Unknown tool: ${name}`);
    }

    state.notes[noteId].updatedAt = new Date().toISOString();
    elements.editor.value = state.notes[noteId].content;
    renderPreview(state.notes[noteId].content);
    updateCharCount();
    updateEditorGutter();
    saveState();
    renderNotesList();
    updateLastSaved();
    updateStatus('Note updated by AI', 'success');
}
