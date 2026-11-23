/* One dashboard section for every AI tool: assistant, course creator, material creator.
   Each tool is the page that already exists; the hub only shows tabs and opens a tool the first time it is chosen. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el;
    const TOOLS = [['ai', 'AI yordamchi', 'fa-wand-magic-sparkles'], ['ai-courses', 'Kurs yaratuvchi', 'fa-graduation-cap'], ['ai-materials', 'Material yaratuvchi', 'fa-file-pen']];

    G.register('ai-hub', async function (root, session) {
        root.textContent = '';
        let current = TOOLS.some(function (t) { return t[0] === G.ctx.aiTab; }) ? G.ctx.aiTab : 'ai';
        const pg = el('div', 'pg'); root.appendChild(pg);
        const hd = el('div', 'pg-head'); const d = el('div');
        d.appendChild(el('h1', '', 'AI vositalari'));
        d.appendChild(el('p', '', "Savol bering, kurs va material yarating: hammasi shu yerda."));
        hd.appendChild(d); pg.appendChild(hd);

        const bar = el('div', 'pg-tabs pg-tabs-wrap'); bar.setAttribute('role', 'tablist'); pg.appendChild(bar);
        const holder = el('div'); pg.appendChild(holder);
        const panes = {}; const loaded = {};

        function fail(err) { const p = el('p', 'pg-muted', "Ma'lumotlarni yuklab bo'lmadi. Keyinroq urinib ko'ring."); p.setAttribute('role', 'alert'); return p; }
        // A tool is opened once; switching back shows it as it was (a half-written chat is not lost)
        function show(key) {
            current = key; G.ctx.aiTab = key;
            bar.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === key); b.setAttribute('aria-selected', String(b.dataset.tab === key)); });
            TOOLS.forEach(function (t) { if (panes[t[0]]) panes[t[0]].hidden = t[0] !== key; });
            if (loaded[key]) return Promise.resolve();
            loaded[key] = true;
            const pane = panes[key];
            return G.hydrate(key, pane, session, function () { ['token', 'user', 'userRole'].forEach(function (k) { try { localStorage.removeItem(k); } catch (x) { /* ignore */ } }); location.replace('../login/login.html'); }, function (err) { console.error('AI tool failed:', err); pane.textContent = ''; pane.appendChild(fail(err)); });
        }
        TOOLS.forEach(function (t) {
            const b = el('button', '', t[1]); b.type = 'button'; b.dataset.tab = t[0]; b.setAttribute('role', 'tab');
            b.addEventListener('click', function () { show(t[0]); });
            bar.appendChild(b);
            const pane = el('div'); pane.dataset.pane = t[0]; pane.hidden = true; panes[t[0]] = pane; holder.appendChild(pane);
        });
        await show(current);
    });
})();
