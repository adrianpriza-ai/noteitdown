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

function handleGlobalKeydown(e) {
    if (e.key === 'Escape') {
        closeSettings();
    }
}

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
