function addToHistory(content) {
    if (state.historyIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.historyIndex + 1);
    }

    state.history.push(content);

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

    addToHistory('');

    if (state.isSyncEnabled) syncNoteToSupabase(id);
}

function deleteNote(id, event) {
    event.stopPropagation();

    if (Object.keys(state.notes).length === 1) {
        if (!confirm('Delete this note?')) return;
    }

    delete state.notes[id];

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
    if (state.activeNoteId && state.notes[state.activeNoteId]) {
        addToHistory(state.notes[state.activeNoteId].content);
    }

    state.activeNoteId = id;
    saveState();
    renderNotesList();
    loadActiveNote();

    // On mobile: automatically switch to editor after selecting a note
    if (typeof mobileGoToEditor === 'function') mobileGoToEditor();
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

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveState();
        renderNotesList();
        updateStatus('Saved locally', 'success');
        updateLastSaved();

        if (state.isSyncEnabled && state.activeNoteId) {
            syncNoteToSupabase(state.activeNoteId);
        }
    }, 800);
}

function handleEditorKeydown(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = elements.editor.selectionStart;
        const end = elements.editor.selectionEnd;
        elements.editor.value = elements.editor.value.substring(0, start) + '  ' + elements.editor.value.substring(end);
        elements.editor.selectionStart = elements.editor.selectionEnd = start + 2;
        handleEditorInput();
    }

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

    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        handleToolbarAction('bold');
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        handleToolbarAction('italic');
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewNote();
    }
}

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

    if (state.searchQuery) {
        noteIds = noteIds.filter(id => {
            const note = state.notes[id];
            const title = (note.title || '').toLowerCase();
            const content = (note.content || '').toLowerCase();
            return title.includes(state.searchQuery) || content.includes(state.searchQuery);
        });
    }

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
