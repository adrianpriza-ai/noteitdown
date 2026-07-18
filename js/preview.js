function renderPreview(markdown) {
    try {
        elements.preview.innerHTML = marked.parse(markdown || '');
    } catch (e) {
        elements.preview.innerHTML = '<p style="color: red;">Error rendering markdown</p>';
    }
}

function updateCharCount() {
    const count = elements.editor.value.length;
    elements.charCount.textContent = `${count} character${count !== 1 ? 's' : ''}`;
}

function updateEditorGutter() {
    const lines = elements.editor.value.split('\n').length;
    const current = elements.editorGutter.childElementCount;
    if (lines === current) return;

    let html = '';
    for (let i = 1; i <= lines; i++) {
        html += `<div>${i}</div>`;
    }
    elements.editorGutter.innerHTML = html;
}

function copyPreviewHTML() {
    const html = elements.preview.innerHTML;
    navigator.clipboard.writeText(html).then(() => {
        updateStatus('HTML copied to clipboard', 'success');
    }).catch(() => {
        updateStatus('Failed to copy', 'error');
    });
}

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

function applyTheme() {
    if (state.isDarkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        elements.darkModeToggle?.classList.add('active');
    } else {
        document.documentElement.removeAttribute('data-theme');
        elements.darkModeToggle?.classList.remove('active');
    }
}

function toggleDarkMode() {
    state.isDarkMode = !state.isDarkMode;
    applyTheme();
    saveState();
}
