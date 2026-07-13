function init() {
    marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
    });

    loadState();
    loadSupabaseConfig();
    loadAIConfig();
    applyTheme();

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

document.addEventListener('DOMContentLoaded', () => {
    init();
});
