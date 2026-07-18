// DOM Elements
const elements = {
    app: document.getElementById('app'),
    editor: document.getElementById('editor'),
    editorGutter: document.getElementById('editorGutter'),
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
    saveBtn: document.getElementById('saveBtn'),
    darkModeToggle: document.getElementById('darkModeToggle'),
    copyPreviewBtn: document.getElementById('copyPreviewBtn'),
    aiChatToggleBtn: document.getElementById('aiChatToggleBtn'),
    aiChatPanel: document.getElementById('aiChatPanel'),
    aiChatMessages: document.getElementById('aiChatMessages'),
    aiChatInput: document.getElementById('aiChatInput'),
    aiSendBtn: document.getElementById('aiSendBtn'),
    closeAiChatBtn: document.getElementById('closeAiChatBtn'),
    syncInterval: document.getElementById('syncInterval'),
    syncIntervalValue: document.getElementById('syncIntervalValue'),
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
    isAiEnabled: false,
    isAiChatOpen: false,
    searchQuery: '',
    history: [],
    historyIndex: -1,
    maxHistory: 50,
    isLocalMode: false
};

let saveTimeout = null;
let localApiSaveTimeout = null;
let searchTimeout = null;
let historyTimeout = null;

// Auto-detect local mode: served from NoteItDown local server on port 3721
function detectLocalMode() {
    if (window.NOTEITDOWN_LOCAL_MODE) {
        state.isLocalMode = true;
    } else {
        const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'].includes(window.location.hostname);
        state.isLocalMode = isLocalHost && window.location.port === '3721';
    }
    return state.isLocalMode;
}
