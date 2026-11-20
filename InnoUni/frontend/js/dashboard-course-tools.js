/* Tools around course items (real session only): a private note and bookmark for the student, and links (materials)
   the teacher attaches. Needs dashboard-data.js. Text goes in via textContent only; links must be http(s). */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get; const send = G.api.send;

    const safeHref = function (u) { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:' ? x.toString() : null; } catch (e) { return null; } };
    function link(m) {
        const href = safeHref(m.url);
        const a = el('a', '', m.title); a.style.cssText = 'overflow-wrap:anywhere;font-weight:600';
        if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        return a;
    }

    const tools = {};
    G.courseTools = tools;

    // Everything for one course: my notes, the bookmarks, the materials. Null when it cannot be loaded (the page works without it).
    tools.load = async function (courseId, session) {
        try {
            const d = await get('/course-tools/courses/' + courseId, session);
            const notes = new Map(d.notes.map(function (n) { return [n.item_id, { body: n.body, bookmarked: n.bookmarked }]; }));
            return { courseId: courseId, notes: notes, materials: d.materials, canManage: d.can_manage, maxNote: (d.limits && d.limits.maxNote) || 2000, listeners: [] };
        } catch (e) { if (e.auth) throw e; return null; }
    };
    const changed = function (t) { t.listeners.forEach(function (f) { f(); }); };
    const noteOf = function (t, itemId) { return t.notes.get(itemId) || { body: '', bookmarked: false }; };
    const materialsOf = function (t, itemId) { return t.materials.filter(function (m) { return m.item_id === itemId; }); };

    // The short label for the toggle button of an item: what is inside the panel
    tools.badge = function (t, itemId) {
        const n = noteOf(t, itemId); const parts = [];
        if (n.bookmarked) parts.push('★');
        if (n.body) parts.push('eslatma');
        const m = materialsOf(t, itemId).length;
        if (m) parts.push(m + ' ta material');
        return parts.length ? ' · ' + parts.join(' · ') : '';
    };

    // The panel under an item: bookmark, note, materials
    tools.panel = function (t, itemId, session, onBadge) {
        const box = el('div'); box.style.cssText = 'margin:8px 0 4px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;display:grid;gap:10px';
        const cur = noteOf(t, itemId);
        const mats = materialsOf(t, itemId);
        if (mats.length) {
            const wrap = el('div'); wrap.appendChild(el('b', 'pg-muted', 'Materiallar'));
            mats.forEach(function (m) { const r = el('div'); r.style.marginTop = '4px'; r.appendChild(link(m)); wrap.appendChild(r); });
            box.appendChild(wrap);
        }
        const mark = el('button', 'pg-btn ghost'); mark.type = 'button'; mark.style.cssText = 'justify-self:start;padding:6px 12px';
        const paintMark = function () { const on = noteOf(t, itemId).bookmarked; mark.textContent = on ? '★ Xatcho\'pda' : '☆ Xatcho\'pga qo\'shish'; mark.setAttribute('aria-pressed', on ? 'true' : 'false'); };
        paintMark();
        const ta = el('textarea', 'pg-input'); ta.rows = 3; ta.maxLength = t.maxNote; ta.value = cur.body; ta.placeholder = 'Shaxsiy eslatma (faqat siz ko\'rasiz)'; ta.setAttribute('aria-label', 'Eslatma');
        const row = el('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center';
        const save = el('button', 'pg-btn', 'Eslatmani saqlash'); save.type = 'button'; save.style.padding = '6px 12px';
        const msg = el('span', 'pg-muted'); msg.setAttribute('role', 'status');
        row.appendChild(save); row.appendChild(msg);
        async function persist(payload, done) {
            msg.textContent = '';
            try {
                const r = await send('PUT', '/course-tools/items/' + itemId + '/note', session, payload);
                if (r.body || r.bookmarked) t.notes.set(itemId, { body: r.body, bookmarked: r.bookmarked }); else t.notes.delete(itemId);
                ta.value = r.body; paintMark(); changed(t); if (onBadge) onBadge();
                if (done) msg.textContent = done;
            } catch (e) { if (e.auth) throw e; msg.textContent = 'Saqlab bo\'lmadi. Qayta urinib ko\'ring.'; }
        }
        mark.addEventListener('click', function () { persist({ bookmarked: !noteOf(t, itemId).bookmarked }); });
        save.addEventListener('click', async function () { save.disabled = true; await persist({ body: ta.value }, 'Saqlandi'); save.disabled = false; });
        box.appendChild(mark); box.appendChild(ta); box.appendChild(row);
        return box;
    };

    // "My notes and bookmarks" of the whole course; clicking one opens that item
    tools.mine = function (t, items, openers) {
        const card = el('section', 'pg-card'); card.style.marginTop = '14px';
        function draw() {
            card.textContent = '';
            const mine = items.filter(function (it) { const n = t.notes.get(it.id); return n && (n.body || n.bookmarked); });
            card.hidden = !mine.length;
            if (!mine.length) return;
            card.appendChild(el('h3', 'pg-h3', 'Mening eslatmalarim va xatcho\'plarim'));
            mine.forEach(function (it) {
                const n = t.notes.get(it.id);
                const r = el('div', 'pg-row'); r.style.alignItems = 'flex-start';
                const d = el('div'); d.style.cssText = 'flex:1;min-width:0';
                d.appendChild(el('b', '', (n.bookmarked ? '★ ' : '') + it.title));
                if (n.body) { const p = el('div', 'pg-muted', n.body.length > 160 ? n.body.slice(0, 157) + '...' : n.body); p.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere'; d.appendChild(p); }
                r.appendChild(d);
                if (openers[it.id]) { const go = el('button', 'pg-btn ghost', 'Ochish'); go.type = 'button'; go.style.padding = '6px 12px'; go.addEventListener('click', openers[it.id]); r.appendChild(go); }
                card.appendChild(r);
            });
        }
        t.listeners.push(draw); draw();
        return card;
    };

    // For the teacher / creator: attach links to the course or to one item, remove them
    tools.manager = function (courseId, session, getItems) {
        const card = el('section', 'pg-card'); card.style.marginTop = '14px';
        card.appendChild(el('h3', 'pg-h3', 'Materiallar'));
        card.appendChild(el('p', 'pg-muted', 'Havola qo\'shing (PDF, slayd, maqola). Kursga yozilgan o\'quvchilar ko\'radi. Fayl yuklash yo\'q: faylni Drive kabi joyga qo\'yib, havolasini kiriting.'));
        const list = el('div'); card.appendChild(list);
        const form = el('form'); form.noValidate = true; form.style.cssText = 'display:grid;gap:8px;margin-top:12px';
        const title = el('input', 'pg-input'); title.type = 'text'; title.maxLength = 200; title.placeholder = 'Material nomi'; title.setAttribute('aria-label', 'Material nomi');
        const url = el('input', 'pg-input'); url.type = 'url'; url.maxLength = 500; url.placeholder = 'https://...'; url.setAttribute('aria-label', 'Havola');
        const where = el('select', 'pg-input'); where.setAttribute('aria-label', 'Qayerga biriktirish');
        const msg = el('p', 'pg-muted'); msg.setAttribute('role', 'alert'); msg.style.minHeight = '1.2em';
        const add = el('button', 'pg-btn', 'Material qo\'shish'); add.type = 'submit'; add.style.justifySelf = 'start';
        [title, url, where, add, msg].forEach(function (n) { form.appendChild(n); });
        card.appendChild(form);
        let materials = []; let loaded = false;
        function drawList() {
            list.textContent = '';
            if (!loaded) { list.appendChild(el('p', 'pg-muted', 'Yuklanmoqda...')); return; }
            if (!materials.length) { list.appendChild(el('p', 'pg-muted', 'Hali material yo\'q.')); return; }
            const items = getItems();
            materials.forEach(function (m) {
                const r = el('div', 'pg-row');
                const d = el('div'); d.style.cssText = 'flex:1;min-width:0'; d.appendChild(link(m));
                const it = items.find(function (x) { return x.id === m.item_id; });
                d.appendChild(el('div', 'pg-muted', it ? 'Dars: ' + it.title : 'Butun kurs uchun'));
                const del = el('button', 'pg-btn ghost', 'O\'chirish'); del.type = 'button'; del.style.padding = '6px 12px';
                G.twice(del, 'Aniqmi?', async function () {
                    try { await send('DELETE', '/course-tools/courses/' + courseId + '/materials/' + m.id, session); materials = materials.filter(function (x) { return x.id !== m.id; }); drawList(); }
                    catch (e) { if (e.auth) throw e; msg.textContent = 'O\'chirib bo\'lmadi.'; }
                });
                r.appendChild(d); r.appendChild(del); list.appendChild(r);
            });
        }
        function drawWhere() {
            const keep = where.value; where.textContent = '';
            const all = el('option', '', 'Butun kurs uchun'); all.value = ''; where.appendChild(all);
            getItems().forEach(function (it) { const o = el('option', '', it.title); o.value = String(it.id); where.appendChild(o); });
            where.value = keep;
        }
        form.addEventListener('submit', async function (e) {
            e.preventDefault(); msg.textContent = '';
            if (!title.value.trim()) { msg.textContent = 'Material nomini kiriting.'; return; }
            if (!safeHref(url.value.trim())) { msg.textContent = 'Havola http:// yoki https:// bilan boshlanishi kerak.'; return; }
            add.disabled = true;
            try {
                const body = { title: title.value, url: url.value.trim() };
                if (where.value) body.item_id = Number(where.value);
                const r = await send('POST', '/course-tools/courses/' + courseId + '/materials', session, body);
                materials.push({ id: r.id, item_id: r.item_id, title: r.title, url: r.url });
                title.value = ''; url.value = ''; drawList();
            } catch (er) { if (er.auth) throw er; msg.textContent = 'Qo\'shib bo\'lmadi. Havolani tekshiring (ko\'pi bilan 60 ta material).'; }
            add.disabled = false;
        });
        get('/course-tools/courses/' + courseId, session).then(function (d) { materials = d.materials; loaded = true; drawList(); }).catch(function () { loaded = true; list.textContent = ''; list.appendChild(el('p', 'pg-muted', 'Materiallarni yuklab bo\'lmadi.')); });
        drawList(); drawWhere();
        card.refresh = function () { drawWhere(); drawList(); };
        return card;
    };
})();
