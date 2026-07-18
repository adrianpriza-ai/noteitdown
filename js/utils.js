function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
    const lines = (note.content || '').split('\n');
    // Look for the first markdown heading (e.g. "# Header", "## Subheader")
    for (const line of lines) {
        const trimmed = line.trim();
        const match = trimmed.match(/^#{1,6}\s+(.+)/);
        if (match) {
            return match[1].trim().slice(0, 80);
        }
    }
    // Fall back to the first non-empty line
    const first = lines.find(l => l.trim());
    return first ? first.trim().slice(0, 80) : 'Untitled note';
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
