// Shared helpers for building HTML safely.
// Load this file BEFORE api.js and the dashboard scripts.
(function (global) {
    var ENTITIES = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    // Escape text before putting it into innerHTML / HTML attributes.
    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return ENTITIES[ch];
        });
    }

    // Allow only http(s), image data URLs and plain relative paths in src attributes.
    // Anything else (javascript:, vbscript:, data:text/html ...) falls back to `fallback`.
    function safeUrl(url, fallback) {
        var value = String(url == null ? '' : url).trim();
        var scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);

        if (!scheme) {
            return value || fallback || '';
        }

        var name = scheme[1].toLowerCase();
        if (name === 'http' || name === 'https') {
            return value;
        }
        if (name === 'data' && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value)) {
            return value;
        }
        return fallback || '';
    }

    global.escapeHtml = escapeHtml;
    global.safeUrl = safeUrl;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { escapeHtml: escapeHtml, safeUrl: safeUrl };
    }
})(typeof window !== 'undefined' ? window : globalThis);
