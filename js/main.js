function init() {
    marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
    });

    detectLocalMode();

    loadState();

    if (state.isLocalMode) {
        // Local mode: load notes from the API, fall back to localStorage
        showLocalModeUI();
        loadFromLocalApi().then(() => {
            loadSupabaseConfig();
        });
    } else {
        // Cloud / standalone mode: load from Supabase if configured
        loadSupabaseConfig();
    }

    loadAIConfig();
    loadSyncConfig();
    applyTheme();

    if (!state.isLocalMode) {
        renderNotesList();
        loadActiveNote();
    }

    updateCharCount();
    updateEditorGutter();
    setupEventListeners();
    fetchLatestVersion();

    updateStatus(state.isLocalMode ? 'Local mode — SQLite' : 'Ready', 'info');
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

// ─── Local Mode UI ───────────────────────────────────────────────────────────

function showLocalModeUI() {
    // Show the existing local mode badge (remove hidden class)
    const badge = document.getElementById('localModeBadge');
    if (badge) {
        badge.classList.remove('hidden');
    }

    // Update about section to show local mode
    const aboutMode = document.getElementById('aboutMode');
    if (aboutMode) {
        aboutMode.textContent = 'Running with local SQLite database on port 3721';
    }
}

function setupEventListeners() {
    // Editor
    elements.editor.addEventListener('input', handleEditorInput);
    elements.editor.addEventListener('keydown', handleEditorKeydown);
    elements.editor.addEventListener('scroll', () => {
        elements.editorGutter.scrollTop = elements.editor.scrollTop;
    });

    // Buttons
    elements.newNoteBtn.addEventListener('click', createNewNote);
    elements.darkModeBtn.addEventListener('click', toggleDarkMode);
    elements.sidebarToggleBtn.addEventListener('click', toggleSidebar);
    elements.settingsBtn.addEventListener('click', openSettings);
    elements.closeModalBtn.addEventListener('click', closeSettings);
    elements.saveBtn.addEventListener('click', saveSettings);
    elements.testBtn.addEventListener('click', testConnection);
    elements.clearSyncBtn.addEventListener('click', clearSync);
    elements.darkModeToggle.addEventListener('click', toggleDarkMode);
    elements.copyPreviewBtn.addEventListener('click', copyPreviewHTML);

    // Sync interval range slider — auto-save on drag
    if (elements.syncInterval) {
        elements.syncInterval.addEventListener('input', () => {
            updateSyncIntervalDisplay();
            saveSyncConfig();
        });
    }

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

function fetchLatestVersion() {
    fetch('https://api.github.com/repos/adrianpriza-ai/noteitdown/tags')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            if (Array.isArray(data) && data.length > 0) {
                const latestTag = data[0].name;
                const versionEl = document.getElementById('appVersion');
                if (versionEl) {
                    versionEl.textContent = latestTag;
                }
            }
        })
        .catch(err => console.error('Error fetching latest version:', err));
}

document.addEventListener('DOMContentLoaded', () => {
    init();
    initMobileNav();
});

// ─── Mobile Navigation ───────────────────────────────────────────────────────

const MOBILE_BREAKPOINT = 640;

function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

let currentMobilePanel = 'notes';

function initMobileNav() {
    // Always register listeners — CSS hides the nav on desktop.
    // Do NOT bail early here based on isMobile(); that would mean
    // buttons silently have no handlers if page loads wide then is resized.

    // Bottom nav tab buttons
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activateMobilePanel(btn.dataset.target);
        });
    });

    // FAB → create new note and switch to Editor
    const fab = document.getElementById('mobileFabBtn');
    if (fab) {
        fab.addEventListener('click', () => {
            createNewNote();
            activateMobilePanel('editor');
        });
    }

    // Set initial panel state if we are already on mobile at load time
    if (isMobile()) {
        activateMobilePanel('notes');
    }

    // Re-evaluate on orientation / resize
    window.addEventListener('resize', () => {
        if (isMobile()) {
            activateMobilePanel(currentMobilePanel);
        }
    });
}

function activateMobilePanel(panelName) {
    currentMobilePanel = panelName;

    const sidebar      = document.getElementById('sidebar');
    const editorSec    = document.querySelector('.editor-section');
    const previewSec   = document.querySelector('.preview-section');
    const fab          = document.getElementById('mobileFabBtn');

    // Remove active from all panels
    [sidebar, editorSec, previewSec].forEach(el => {
        if (el) el.classList.remove('mobile-active');
    });

    // Show the chosen panel
    const targets = { notes: sidebar, editor: editorSec, preview: previewSec };
    const target = targets[panelName];
    if (target) target.classList.add('mobile-active');

    // Sync bottom nav indicator
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === panelName);
    });

    // FAB only visible on Notes panel
    if (fab) {
        fab.classList.toggle('hidden-fab', panelName !== 'notes');
    }
}

/**
 * Called by notes.js when user taps a note — auto-navigates to Editor on mobile.
 */
function mobileGoToEditor() {
    if (isMobile()) {
        activateMobilePanel('editor');
    }
}
