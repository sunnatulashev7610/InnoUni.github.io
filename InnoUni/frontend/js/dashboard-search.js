/* Header search: looks through the signed-in person's own courses, tasks and groups (already allowed endpoints,
   loaded once on first focus). Results are built with textContent; clicking one opens its page. Needs dashboard-data.js. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get;

    const norm = function (s) { return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[ʻʼ'`‘’]/g, ''); };

    // Pure matching, kept separate so it can be tested: items are { kind, title, sub, go }
    function match(items, q, limit) {
        const words = norm(q).split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        const out = [];
        for (const it of items) {
            const hay = norm(it.title + ' ' + (it.sub || ''));
            if (!words.every(function (w) { return hay.indexOf(w) !== -1; })) continue;
            // titles that start with the first word come first
            out.push({ it: it, rank: norm(it.title).indexOf(words[0]) === 0 ? 0 : 1 });
        }
        out.sort(function (a, b) { return a.rank - b.rank; });
        return out.slice(0, limit || 8).map(function (x) { return x.it; });
    }

    async function load(session) {
        const teacher = session.role === 'teacher';
        const items = [];
        const jobs = [];
        if (teacher) {
            jobs.push(get('/teacher/courses', session).then(function (d) {
                (d.courses || []).forEach(function (c) { items.push({ kind: 'Kurs', title: c.title, sub: c.category, go: function () { G.ctx.courseId = c.id; G.open('t-course-edit', 't-courses'); } }); });
            }));
        } else {
            jobs.push(get('/student/courses', session).then(function (d) {
                // the public catalog is closed: only the courses the student is in
                (d.courses || []).filter(function (c) { return c.enrolled || !(window.FEATURES && window.FEATURES.courses === false); }).forEach(function (c) { items.push({ kind: 'Kurs', title: c.title, sub: [c.category, c.teacher].filter(Boolean).join(' '), go: function () { G.ctx.courseId = c.id; G.open('course-detail', 'courses'); } }); });
            }));
            if (!(window.FEATURES && window.FEATURES.tasks === false)) jobs.push(get('/student/tasks', session).then(function (d) {
                (d.tasks || []).forEach(function (t) { items.push({ kind: 'Vazifa', title: t.title, sub: t.course, go: function () { G.open('vazifalar', 'vazifalar'); } }); });
            }));
        }
        if (!(window.FEATURES && window.FEATURES.groups === false)) jobs.push(get('/groups', session).then(function (d) {
            (d.groups || []).forEach(function (g) { items.push({ kind: 'Guruh', title: g.name, sub: '', go: function () { G.ctx.groupId = g.id; G.open('group-detail', 'groups'); } }); });
        }));
        // one failing source must not break the others
        await Promise.all(jobs.map(function (j) { return j.catch(function () { /* skip this source */ }); }));
        return items;
    }

    function start(session) {
        const input = document.querySelector('.search-bar input');
        if (!input || input.dataset.geSearch) return;
        input.dataset.geSearch = '1';
        input.maxLength = 100; input.setAttribute('aria-label', 'Qidirish'); input.setAttribute('autocomplete', 'off');
        const bar = input.parentNode;
        const list = el('div', 'search-results'); list.setAttribute('role', 'listbox'); list.hidden = true;
        bar.appendChild(list);
        let items = null; let loading = null; let shown = []; let active = -1;

        const close = function () { list.hidden = true; active = -1; };
        function paint() {
            list.textContent = '';
            shown.forEach(function (it, i) {
                const b = el('button', 'search-item' + (i === active ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'option');
                b.appendChild(el('span', 'search-kind', it.kind));
                b.appendChild(el('span', 'search-title', it.title));
                b.addEventListener('mousedown', function (e) { e.preventDefault(); });
                b.addEventListener('click', function () { choose(it); });
                list.appendChild(b);
            });
            if (!shown.length) list.appendChild(el('div', 'search-empty', 'Hech narsa topilmadi'));
            list.hidden = false;
        }
        function choose(it) { close(); input.value = ''; it.go(); }
        async function run() {
            const q = input.value.trim();
            if (!q) { close(); return; }
            if (!items) {
                if (!loading) loading = load(session).then(function (r) { items = r; });
                list.textContent = ''; list.appendChild(el('div', 'search-empty', 'Qidirilmoqda...')); list.hidden = false;
                await loading;
                if (input.value.trim() !== q) return; // the text changed while loading
            }
            shown = match(items, q, 8); active = -1; paint();
        }
        input.addEventListener('input', run);
        input.addEventListener('focus', function () { if (input.value.trim()) run(); });
        input.addEventListener('blur', function () { setTimeout(close, 120); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { close(); return; }
            if (list.hidden || !shown.length) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; paint();
            } else if (e.key === 'Enter') { e.preventDefault(); choose(shown[active >= 0 ? active : 0]); }
        });
        // "/" jumps to the search box from anywhere outside a text field
        document.addEventListener('keydown', function (e) {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
            e.preventDefault(); input.focus();
        });
    }

    G.search = { start: start, match: match, _norm: norm };
})();
