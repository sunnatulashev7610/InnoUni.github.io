const ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

// Escape user-provided text before putting it into HTML (emails, pages)
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}

module.exports = { escapeHtml };
