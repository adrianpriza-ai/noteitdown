// DOM Elements
const elements = {
    app: document.getElementById('app'),
    editor: document.getElementById('editor'),
    preview: document.getElementById('preview'),
    previewSection: document.querySelector('.preview-section'),
    notesList: document.getElementById('notesList'),
    status: document.getElementById('status'),
    syncStatus: document.getElementById('syncStatus'),
    lastSaved: document.getElementById('lastSaved'),
    charCount: document.getElementById('charCount'),
    noteCount: document.getElementById('noteCount'),
    searchInput: document.getElementById('searchInput'),
    newNoteBtn: document.getElementById('newNoteBtn'),
    darkModeBtn: document.getElementById('darkModeBtn'),
    sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    sidebar: document.getElementById('sidebar'),
    settingsModal: document.getElementById('settingsModal'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    supabaseUrl: document.getElementById('supabaseUrl'),
    anonKey: document.getElementById('anonKey'),
    testBtn: document.getElementById('testBtn'),
    clearSyncBtn: document.getElementById('clearSyncBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    saveBtn: document.getElementById('saveBtn'),
    darkModeToggle: document.getElementById('darkModeToggle'),
    copyPreviewBtn: document.getElementById('copyPreviewBtn'),
    rawToggleBtn: document.getElementById('rawToggleBtn'),
    aiChatToggleBtn: document.getElementById('aiChatToggleBtn'),
    aiChatPanel: document.getElementById('aiChatPanel'),
    aiChatMessages: document.getElementById('aiChatMessages'),
    aiChatInput: document.getElementById('aiChatInput'),
    aiSendBtn: document.getElementById('aiSendBtn'),
    closeAiChatBtn: document.getElementById('closeAiChatBtn'),
    aiEnableToggle: document.getElementById('aiEnableToggle'),
    aiEndpoint: document.getElementById('aiEndpoint'),
    aiApiKey: document.getElementById('aiApiKey'),
    aiModelSelect: document.getElementById('aiModelSelect'),
    fetchModelsBtn: document.getElementById('fetchModelsBtn'),
    aiConfigSection: document.getElementById('aiConfigSection'),
    aiConfigMessage: document.getElementById('aiConfigMessage'),
    connectionMessage: document.getElementById('connectionMessage'),
    toolbarBtns: document.querySelectorAll('.toolbar-btn')
};

// App State
let state = {
    notes: {},
    activeNoteId: null,
    supabaseClient: null,
    isSyncEnabled: false,
    isDarkMode: false,
    isRawMode: false,
    isAiEnabled: false,
    isAiChatOpen: false,
    searchQuery: '',
    history: [],
    historyIndex: -1,
    maxHistory: 50
};

let saveTimeout = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    init();
});

function init() {
    // Configure marked
    marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
    });
    
    // Load state
    loadState();
    loadSupabaseConfig();
    loadAIConfig();
    applyTheme();
    
    // Render UI
    renderNotesList();
    loadActiveNote();
    updateCharCount();
    setupEventListeners();
    
    updateStatus('Ready', 'info');
}

function loadState() {
    try {
        const savedNotes = localStorage.getItem('markdownNotes');
        const savedActiveId = localStorage.getItem('activeNoteId');
        const savedTheme = localStorage.getItem('darkMode');
        
        if (savedNotes) {
            const parsed = JSON.parse(savedNotes);
            const migrated = {};
            for (const [id, note] of Object.entries(parsed)) {
                // Re-key legacy non-uuid ids to uuids so they fit the shared schema
                const newId = isUuid(id) ? id : uuid();
                migrated[newId] = normalizeNote(note);
            }
            state.notes = migrated;
        }
        
        if (savedActiveId && state.notes[savedActiveId]) {
            state.activeNoteId = savedActiveId;
        } else {
            const noteIds = Object.keys(state.notes);
            state.activeNoteId = noteIds.length > 0 ? noteIds[0] : null;
        }
        
        if (savedTheme === 'true') {
            state.isDarkMode = true;
        }
        
        if (Object.keys(state.notes).length === 0) {
            createNewNote();
        }
    } catch (e) {
        console.error('Error loading state:', e);
        state.notes = {};
    }
}

function saveState() {
    try {
        localStorage.setItem('markdownNotes', JSON.stringify(state.notes));
        localStorage.setItem('activeNoteId', state.activeNoteId);
        localStorage.setItem('darkMode', state.isDarkMode);
    } catch (e) {
        console.error('Error saving state:', e);
    }
}

function applyTheme() {
    if (state.isDarkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        elements.darkModeToggle?.classList.add('active');
    } else {
        document.documentElement.removeAttribute('data-theme');
        elements.darkModeToggle?.classList.remove('active');
    }
}

function setupEventListeners() {
    // Editor
    elements.editor.addEventListener('input', handleEditorInput);
    elements.editor.addEventListener('keydown', handleEditorKeydown);
    
    // Buttons
    elements.newNoteBtn.addEventListener('click', createNewNote);
    elements.darkModeBtn.addEventListener('click', toggleDarkMode);
    elements.sidebarToggleBtn.addEventListener('click', toggleSidebar);
    elements.settingsBtn.addEventListener('click', openSettings);
    elements.closeModalBtn.addEventListener('click', closeSettings);
    elements.cancelBtn.addEventListener('click', closeSettings);
    elements.saveBtn.addEventListener('click', saveSettings);
    elements.testBtn.addEventListener('click', testConnection);
    elements.clearSyncBtn.addEventListener('click', clearSync);
    elements.darkModeToggle.addEventListener('click', toggleDarkMode);
    elements.copyPreviewBtn.addEventListener('click', copyPreviewHTML);
    elements.rawToggleBtn.addEventListener('click', toggleRawMode);
    
    // AI Chat
    elements.aiChatToggleBtn.addEventListener('click', toggleAiChat);
    elements.closeAiChatBtn.addEventListener('click', closeAiChat);
    elements.aiSendBtn.addEventListener('click', sendAiMessage);
    elements.aiChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendAiMessage();
        }
    });
    elements.aiEnableToggle.addEventListener('click', toggleAIEnable);
    elements.fetchModelsBtn.addEventListener('click', fetchModels);
    if (elements.aiModelSelect) {
        elements.aiModelSelect.addEventListener('change', () => {
            localStorage.setItem('aiModel', elements.aiModelSelect.value);
        });
    }
    
    // Search
    elements.searchInput.addEventListener('input', handleSearch);
    
    // Toolbar
    elements.toolbarBtns.forEach(btn => {
        btn.addEventListener('click', () => handleToolbarAction(btn.dataset.action));
    });
    
    // Modal backdrop
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) closeSettings();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeydown);
}

// Note Functions
function createNewNote() {
    const id = uuid();
    const now = new Date().toISOString();
    state.notes[id] = {
        title: '',
        content: '',
        tags: [],
        createdAt: now,
        updatedAt: now
    };
    
    state.activeNoteId = id;
    saveState();
    renderNotesList();
    loadActiveNote();
    updateStatus('New note created', 'success');
    
    // Add to history
    addToHistory('');
    
    // Push to Supabase if sync is enabled
    if (state.isSyncEnabled) syncNoteToSupabase(id);
}

function deleteNote(id, event) {
    event.stopPropagation();
    
    if (Object.keys(state.notes).length === 1) {
        if (!confirm('Delete this note?')) return;
    }
    
    delete state.notes[id];
    
    // Remove from Supabase if sync is enabled
    if (state.isSyncEnabled) deleteNoteFromSupabase(id);
    
    const noteIds = Object.keys(state.notes);
    if (noteIds.length > 0) {
        state.activeNoteId = noteIds[0];
    } else {
        createNewNote();
        return;
    }
    
    saveState();
    renderNotesList();
    loadActiveNote();
    updateStatus('Note deleted', 'success');
}

function selectNote(id) {
    // Save current note before switching
    if (state.activeNoteId && state.notes[state.activeNoteId]) {
        addToHistory(state.notes[state.activeNoteId].content);
    }
    
    state.activeNoteId = id;
    saveState();
    renderNotesList();
    loadActiveNote();
}

function loadActiveNote() {
    if (state.activeNoteId && state.notes[state.activeNoteId]) {
        elements.editor.value = state.notes[state.activeNoteId].content;
        renderPreview(state.notes[state.activeNoteId].content);
    } else {
        elements.editor.value = '';
        elements.preview.innerHTML = '';
    }
    updateCharCount();
}

function handleEditorInput() {
    const content = elements.editor.value;
    
    if (state.activeNoteId && state.notes[state.activeNoteId]) {
        state.notes[state.activeNoteId].content = content;
        state.notes[state.activeNoteId].updatedAt = new Date().toISOString();
    }
    
    renderPreview(content);
    updateCharCount();
    
    // Debounced save
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveState();
        renderNotesList();
        updateStatus('Saved locally', 'success');
        updateLastSaved();
        
        // Sync to Supabase if enabled
        if (state.isSyncEnabled && state.activeNoteId) {
            syncNoteToSupabase(state.activeNoteId);
        }
    }, 800);
}

function handleEditorKeydown(e) {
    // Handle Tab key
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = elements.editor.selectionStart;
        const end = elements.editor.selectionEnd;
        elements.editor.value = elements.editor.value.substring(0, start) + '  ' + elements.editor.value.substring(end);
        elements.editor.selectionStart = elements.editor.selectionEnd = start + 2;
        handleEditorInput();
    }
    
    // Undo/Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
            redo();
        } else {
            undo();
        }
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
    }
    
    // Bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        handleToolbarAction('bold');
    }
    
    // Italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        handleToolbarAction('italic');
    }
    
    // New note
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewNote();
    }
}

// History (Undo/Redo)
function addToHistory(content) {
    // Remove any future states if we're not at the end
    if (state.historyIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.historyIndex + 1);
    }
    
    // Add new state
    state.history.push(content);
    
    // Limit history size
    if (state.history.length > state.maxHistory) {
        state.history.shift();
    }
    
    state.historyIndex = state.history.length - 1;
}

function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        const content = state.history[state.historyIndex];
        elements.editor.value = content;
        if (state.activeNoteId && state.notes[state.activeNoteId]) {
            state.notes[state.activeNoteId].content = content;
        }
        renderPreview(content);
        updateCharCount();
        saveState();
    }
}

function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        const content = state.history[state.historyIndex];
        elements.editor.value = content;
        if (state.activeNoteId && state.notes[state.activeNoteId]) {
            state.notes[state.activeNoteId].content = content;
        }
        renderPreview(content);
        updateCharCount();
        saveState();
    }
}

// Preview Functions
function renderPreview(markdown) {
    if (state.isRawMode) {
        elements.preview.innerHTML = `<pre>${escapeHtml(markdown || '')}</pre>`;
        elements.preview.classList.add('raw-mode');
    } else {
        elements.preview.classList.remove('raw-mode');
        try {
            elements.preview.innerHTML = marked.parse(markdown || '');
        } catch (e) {
            elements.preview.innerHTML = '<p style="color: red;">Error rendering markdown</p>';
        }
    }
}

function toggleRawMode() {
    state.isRawMode = !state.isRawMode;
    elements.rawToggleBtn.classList.toggle('active', state.isRawMode);
    
    if (state.activeNoteId && state.notes[state.activeNoteId]) {
        renderPreview(state.notes[state.activeNoteId].content);
    }
}

function updateCharCount() {
    const count = elements.editor.value.length;
    elements.charCount.textContent = `${count} character${count !== 1 ? 's' : ''}`;
}

// Sidebar Functions
function toggleSidebar() {
    elements.sidebar.classList.toggle('collapsed');
}

function handleSearch(e) {
    state.searchQuery = e.target.value.toLowerCase();
    renderNotesList();
}

function renderNotesList() {
    elements.notesList.innerHTML = '';
    
    let noteIds = Object.keys(state.notes).sort((a, b) => 
        new Date(state.notes[b].updatedAt) - new Date(state.notes[a].updatedAt)
    );
    
    // Filter by search query
    if (state.searchQuery) {
        noteIds = noteIds.filter(id => {
            const note = state.notes[id];
            const title = (note.title || '').toLowerCase();
            const content = (note.content || '').toLowerCase();
            return title.includes(state.searchQuery) || content.includes(state.searchQuery);
        });
    }
    
    // Update note count
    elements.noteCount.textContent = `${noteIds.length} note${noteIds.length !== 1 ? 's' : ''}`;
    
    if (noteIds.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'note-empty';
        empty.textContent = state.searchQuery ? 'No matching notes' : 'No notes yet';
        empty.style.cssText = 'padding: 20px; text-align: center; color: var(--text-muted);';
        elements.notesList.appendChild(empty);
        return;
    }
    
    noteIds.forEach(id => {
        const note = state.notes[id];
        const item = document.createElement('div');
        item.className = `note-item ${id === state.activeNoteId ? 'active' : ''}`;
        item.onclick = () => selectNote(id);
        
        const title = deriveTitle(note);
        const previewText = (note.content || '').substring(0, 60).replace(/\n/g, ' ') || 'No content';
        const tagLabel = (note.tags && note.tags.length) ? ' ' + note.tags.map(t => '#' + t).join(' ') : '';
        
        item.innerHTML = `
            <div class="note-title">${escapeHtml(title)}</div>
            <div class="note-preview">${escapeHtml(previewText)}${escapeHtml(tagLabel)}</div>
            <button class="delete-note" data-id="${id}">×</button>
        `;
        
        item.querySelector('.delete-note').addEventListener('click', (e) => deleteNote(id, e));
        elements.notesList.appendChild(item);
    });
}

// Toolbar Functions
function handleToolbarAction(action) {
    const start = elements.editor.selectionStart;
    const end = elements.editor.selectionEnd;
    const text = elements.editor.value;
    const selected = text.substring(start, end);
    let insert = '';
    let cursorOffset = 0;
    
    switch (action) {
        case 'bold':
            insert = `**${selected || 'bold text'}**`;
            cursorOffset = selected ? insert.length : 2;
            break;
        case 'italic':
            insert = `*${selected || 'italic text'}*`;
            cursorOffset = selected ? insert.length : 1;
            break;
        case 'strikethrough':
            insert = `~~${selected || 'strikethrough'}~~`;
            cursorOffset = selected ? insert.length : 2;
            break;
        case 'heading':
            insert = `\n# ${selected || 'Heading'}\n`;
            cursorOffset = selected ? insert.length : 3;
            break;
        case 'list':
            insert = `\n- ${selected || 'list item'}\n`;
            cursorOffset = selected ? insert.length : 3;
            break;
        case 'quote':
            insert = `\n> ${selected || 'quote'}\n`;
            cursorOffset = selected ? insert.length : 3;
            break;
        case 'link':
            insert = `[${selected || 'link text'}](url)`;
            cursorOffset = selected ? insert.length - 1 : 1;
            break;
        case 'image':
            insert = `![${selected || 'alt text'}](image-url)`;
            cursorOffset = selected ? insert.length - 1 : 2;
            break;
        case 'code':
            insert = selected.includes('\n') 
                ? `\`\`\`\n${selected}\n\`\`\`` 
                : `\`${selected || 'code'}\``;
            cursorOffset = insert.length;
            break;
        case 'undo':
            undo();
            return;
        case 'redo':
            redo();
            return;
    }
    
    elements.editor.value = text.substring(0, start) + insert + text.substring(end);
    elements.editor.focus();
    elements.editor.selectionStart = elements.editor.selectionEnd = start + cursorOffset;
    
    handleEditorInput();
}

function copyPreviewHTML() {
    const html = elements.preview.innerHTML;
    navigator.clipboard.writeText(html).then(() => {
        updateStatus('HTML copied to clipboard', 'success');
    }).catch(() => {
        updateStatus('Failed to copy', 'error');
    });
}

// Theme Functions
function toggleDarkMode() {
    state.isDarkMode = !state.isDarkMode;
    applyTheme();
    saveState();
}

// Status Functions
function updateStatus(message, type = 'info') {
    elements.status.textContent = message;
    elements.status.className = `status ${type}`;
    
    setTimeout(() => {
        elements.status.textContent = 'Ready';
        elements.status.className = 'status';
    }, 3000);
}

function updateLastSaved() {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    elements.lastSaved.textContent = `Last saved: ${time}`;
}

function updateSyncStatus(message, type = 'info') {
    elements.syncStatus.textContent = message;
    elements.syncStatus.className = `sync-status ${type}`;
    
    setTimeout(() => {
        elements.syncStatus.textContent = '';
        elements.syncStatus.className = 'sync-status';
    }, 3000);
}

// Settings Functions
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
    elements.settingsModal.classList.add('active');
}

function closeSettings() {
    elements.settingsModal.classList.remove('active');
}

async function saveSettings() {
    const url = elements.supabaseUrl.value.trim();
    const key = elements.anonKey.value.trim();
    
    // Save AI config (independent of Supabase)
    saveAIConfig();
    loadAIConfig();
    
    if (url && key) {
        localStorage.setItem('supabaseUrl', url);
        localStorage.setItem('anonKey', key);
        
        const success = await initSupabase(url, key);
        
        if (success) {
            state.isSyncEnabled = true;
            showMessage('Connected to Supabase!', 'success');
            updateSyncStatus('Connected', 'success');
            
            setTimeout(async () => {
                closeSettings();
                await loadFromSupabase();
            }, 1500);
            return;
        } else {
            showMessage('Failed to connect', 'error');
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
    
    showMessage('Testing connection...', 'info');
    
    const success = await initSupabase(url, key);
    
    if (success) {
        showMessage('Connection successful!', 'success');
    } else {
        showMessage('Connection failed', 'error');
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
}

function showMessage(text, type) {
    elements.connectionMessage.textContent = text;
    elements.connectionMessage.className = `message ${type}`;
    elements.connectionMessage.style.display = 'block';
}

// Global keyboard shortcuts
function handleGlobalKeydown(e) {
    // Close modal with Escape
    if (e.key === 'Escape') {
        closeSettings();
    }
}

// Supabase Functions
function loadSupabaseConfig() {
    const url = localStorage.getItem('supabaseUrl');
    const key = localStorage.getItem('anonKey');
    
    if (url && key) {
        initSupabase(url, key).then(async success => {
            if (success) {
                state.isSyncEnabled = true;
                updateSyncStatus('Connected', 'success');
                await loadFromSupabase();
            }
        });
    }
}

async function initSupabase(url, key) {
    try {
        if (!window.supabase) {
            await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
        }
        
        state.supabaseClient = window.supabase.createClient(url, key);
        
        // Verify the shared `notes` table exists and is reachable
        const { error } = await state.supabaseClient
            .from('notes')
            .select('id')
            .limit(1);
        
        if (error) {
            if (error.code === '42P01') {
                console.error('The `notes` table does not exist. Run `noteitdown setup` (or create it).');
            } else {
                console.error('Supabase error:', error);
            }
            return false;
        }
        
        return true;
    } catch (e) {
        console.error('Failed to init Supabase:', e);
        return false;
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function syncNoteToSupabase(noteId) {
    if (!state.supabaseClient || !state.notes[noteId]) return;
    
    try {
        const note = state.notes[noteId];
        await state.supabaseClient
            .from('notes')
            .upsert({
                id: noteId,
                title: deriveTitle(note),
                content: note.content || '',
                tags: Array.isArray(note.tags) ? note.tags : [],
                created_at: note.createdAt || note.updatedAt,
                updated_at: note.updatedAt
            }, { onConflict: 'id' });
        
        updateSyncStatus('Synced to cloud', 'success');
    } catch (e) {
        console.error('Sync error:', e);
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
        
        await Promise.all(promises);
        updateSyncStatus('All notes synced', 'success');
    } catch (e) {
        console.error('Sync all error:', e);
    }
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Shared schema helpers (kept in sync with the noteitdown MCP server) ---

function uuid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function isUuid(s) {
    return typeof s === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function normalizeNote(note) {
    const updatedAt = note.updatedAt || new Date().toISOString();
    return {
        title: note.title || '',
        content: note.content || '',
        tags: Array.isArray(note.tags) ? note.tags : [],
        createdAt: note.createdAt || updatedAt,
        updatedAt
    };
}

function deriveTitle(note) {
    if (note.title && note.title.trim()) return note.title.trim();
    const first = (note.content || '').split('\n').find(l => l.trim());
    return first ? first.trim().slice(0, 80) : 'Untitled note';
}

// Pull every note from the shared Supabase table, merging with local state
// using last-write-wins on `updated_at`, then push any local-only notes up.
async function loadFromSupabase() {
    if (!state.supabaseClient) return;
    try {
        const { data, error } = await state.supabaseClient
            .from('notes')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Load error:', error);
            return;
        }

        for (const row of (data || [])) {
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
            }
        }

        // Upload any notes that only exist locally
        await syncAllNotes();

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

// AI Config Functions
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

// Tool definitions for AI
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

// AI Chat Functions
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
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const assistantMessage = data.choices[0]?.message;
        
        if (assistantMessage) {
            if (assistantMessage.tool_calls) {
                for (const toolCall of assistantMessage.tool_calls) {
                    try {
                        const fn = toolCall.function;
                        const args = JSON.parse(fn.arguments);
                        executeToolCall(fn.name, args);
                    } catch (e) {
                        addAiMessage({ role: 'system', content: `Tool error: ${e.message}` });
                    }
                }
            }
            if (assistantMessage.content) {
                addAiMessage(assistantMessage);
            }
        }
    } catch (e) {
        addAiMessage({ role: 'system', content: `Error: ${e.message}` });
    }
}

function addAiMessage(message) {
    const div = document.createElement('div');
    div.className = `ai-message ai-message-${message.role}`;
    const content = document.createElement('div');
    content.className = 'ai-message-content';
    content.innerHTML = marked.parse(message.content || '');
    div.appendChild(content);
    elements.aiChatMessages?.appendChild(div);
    if (elements.aiChatMessages) {
        elements.aiChatMessages.scrollTop = elements.aiChatMessages.scrollHeight;
    }
}

function getAiMessages() {
    const msgs = [];
    if (elements.aiChatMessages) {
        elements.aiChatMessages.querySelectorAll('.ai-message').forEach(el => {
            const role = el.classList.contains('ai-message-user') ? 'user' : 
                         el.classList.contains('ai-message-assistant') ? 'assistant' : 'system';
            msgs.push({ role, content: el.textContent });
        });
    }
    return msgs;
}

function executeToolCall(name, args) {
    const noteId = state.activeNoteId;
    if (!noteId || !state.notes[noteId]) {
        addAiMessage({ role: 'system', content: 'Error: No active note.' });
        return;
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
            addAiMessage({ role: 'system', content: `Unknown tool: ${name}` });
            return;
    }

    state.notes[noteId].updatedAt = new Date().toISOString();
    elements.editor.value = state.notes[noteId].content;
    renderPreview(state.notes[noteId].content);
    updateCharCount();
    saveState();
    renderNotesList();
    updateLastSaved();
    updateStatus('Note updated by AI', 'success');
}