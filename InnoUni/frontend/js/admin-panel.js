/* Admin overview and users pages (real session only). Needs the admin token; text is always set with textContent. */
(function () {
    'use strict';
    function base() { return (window.config && window.config.apiBaseUrl) || '/api'; }
    function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
    const ROLE = { student: 'O\'quvchi', teacher: 'O\'qituvchi', admin: 'Admin' };
    const ACTION = { set_role: 'roli o\'zgartirildi', block: 'bloklandi', unblock: 'blokdan chiqarildi', order_confirmed: 'buyurtma tasdiqlandi', order_rejected: 'buyurtma rad etildi' };
    const day = function (s) { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('uz-UZ') + ' ' + d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }); };

    async function call(method, path, token, body) {
        const headers = { Authorization: 'Bearer ' + token };
        const init = { method: method, headers: headers };
        if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
        const res = await fetch(base() + path, init);
        const out = await res.json().catch(function () { return {}; });
        if (res.status === 401 || res.status === 403) { const e = new Error('auth'); e.auth = true; throw e; }
        if (!res.ok) { const e = new Error(out.error || 'HTTP ' + res.status); e.status = res.status; throw e; }
        return out;
    }
    function head(pg, title, sub) {
        const hd = el('div', 'pg-head'); const d = el('div');
        d.appendChild(el('h1', '', title)); d.appendChild(el('p', '', sub));
        hd.appendChild(d); pg.appendChild(hd); return hd;
    }
    function page(root) { root.textContent = ''; const pg = el('div', 'pg'); root.appendChild(pg); return pg; }

    function statCard(icon, value, label, bg, fg) {
        const c = el('div', 'pg-card pg-file');
        const ic = el('div', 'ic'); ic.style.cssText = 'background:' + bg + ';color:' + fg + ';width:46px;height:46px;border-radius:12px;display:grid;place-items:center';
        ic.appendChild(el('i', icon)); c.appendChild(ic);
        const t = el('div'); const v = el('b', '', String(value)); v.style.cssText = 'display:block;font-size:1.5rem;line-height:1.1';
        t.appendChild(v); t.appendChild(el('span', 'pg-muted', label)); c.appendChild(t);
        return c;
    }

    async function home(root, token, onAuth, toast) {
        const pg = page(root);
        head(pg, 'Umumiy ko\'rinish', 'Platformadagi hozirgi holat');
        const grid = el('div', 'pg-grid'); grid.style.cssText = 'grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-bottom:18px';
        pg.appendChild(grid); grid.appendChild(el('p', 'pg-muted', 'Yuklanmoqda...'));
        const todo = el('div', 'pg-card'); pg.appendChild(todo);
        const logCard = el('div', 'pg-card'); logCard.style.marginTop = '14px'; pg.appendChild(logCard);
        try {
            const [s, l] = await Promise.all([call('GET', '/admin/stats', token), call('GET', '/admin/log', token)]);
            grid.textContent = '';
            grid.appendChild(statCard('fas fa-user-graduate', s.users.student, 'O\'quvchilar', 'var(--brand-soft)', 'var(--brand-ink)'));
            grid.appendChild(statCard('fas fa-chalkboard-user', s.users.teacher, 'O\'qituvchilar', 'var(--info-soft)', 'var(--info)'));
            grid.appendChild(statCard('fas fa-book', s.courses, 'Kurslar', 'var(--brand-soft)', 'var(--brand-ink)'));
            grid.appendChild(statCard('fas fa-people-group', s.teams, 'Jamoalar', 'var(--warn-soft)', 'var(--warn)'));
            grid.appendChild(statCard('fas fa-user-plus', s.new_week, 'Oxirgi 7 kunda yangi', 'var(--info-soft)', 'var(--info)'));
            todo.appendChild(el('b', '', 'Kutilayotgan ishlar'));
            const items = [];
            if (s.unverified) items.push(s.unverified + ' ta foydalanuvchi emailini hali tasdiqlamagan.');
            if (!items.length) items.push('Hozircha hammasi joyida.');
            items.forEach(function (t) { const p = el('p', 'pg-muted', t); p.style.margin = '6px 0 0'; todo.appendChild(p); });
            logCard.appendChild(el('b', '', 'Oxirgi admin amallari'));
            if (!l.log.length) { const p = el('p', 'pg-muted', 'Hali amal bajarilmagan.'); p.style.margin = '6px 0 0'; logCard.appendChild(p); }
            l.log.forEach(function (r) {
                const row = el('div', 'pg-row');
                const t = (r.admin || 'Admin') + ' · ' + (r.target ? r.target + ': ' : '') + (ACTION[r.action] || r.action) + (r.action === 'set_role' && r.detail ? ' (' + (ROLE[r.detail] || r.detail) + ')' : '');
                const d = el('div', '', t); d.style.cssText = 'flex:1;min-width:0;overflow-wrap:anywhere';
                row.appendChild(d); row.appendChild(el('span', 'pg-muted', day(r.created_at)));
                logCard.appendChild(row);
            });
        } catch (e) {
            if (e.auth) { onAuth(); return; }
            grid.textContent = ''; todo.textContent = 'Ma\'lumotni yuklab bo\'lmadi. Keyinroq urinib ko\'ring.'; logCard.hidden = true;
        }
    }

    async function users(root, token, onAuth, toast, selfId) {
        const pg = page(root);
        const hd = head(pg, 'Foydalanuvchilar', 'Rolni o\'zgartirish va bloklash');
        const search = el('input', 'pg-input'); search.type = 'search'; search.maxLength = 100; search.placeholder = 'Ism yoki email bo\'yicha qidirish...'; search.setAttribute('aria-label', 'Qidirish'); search.style.maxWidth = '320px';
        hd.appendChild(search);
        const chips = el('div', 'pg-chips'); pg.appendChild(chips);
        const card = el('div', 'pg-card'); card.style.padding = '8px 14px'; pg.appendChild(card);
        let role = ''; let list = []; let ticket = 0; let timer = null;

        function drawChips() {
            chips.textContent = '';
            [['', 'Hammasi'], ['student', 'O\'quvchilar'], ['teacher', 'O\'qituvchilar'], ['admin', 'Adminlar']].forEach(function (p) {
                const b = el('button', 'pg-chip' + (role === p[0] ? ' on' : ''), p[1]); b.type = 'button';
                b.addEventListener('click', function () { role = p[0]; drawChips(); load(); });
                chips.appendChild(b);
            });
        }
        function draw() {
            card.textContent = '';
            if (!list.length) { const p = el('p', 'pg-muted', 'Hech kim topilmadi.'); p.style.padding = '12px'; card.appendChild(p); return; }
            const wrap = el('div'); wrap.style.overflowX = 'auto';
            const table = el('table', 'pg-table');
            const thead = el('thead'); const hr = el('tr');
            ['Foydalanuvchi', 'Rol', 'Holat', 'Qo\'shilgan', ''].forEach(function (h) { hr.appendChild(el('th', '', h)); });
            thead.appendChild(hr); table.appendChild(thead);
            const tb = el('tbody');
            list.forEach(function (u) { tb.appendChild(row(u)); });
            table.appendChild(tb); wrap.appendChild(table); card.appendChild(wrap);
            if (list.length >= 200) { const n = el('p', 'pg-muted', 'Eng so\'nggi 200 tasi ko\'rsatildi. Qidiruvdan foydalaning.'); n.style.padding = '8px 12px'; card.appendChild(n); }
        }
        function row(u) {
            const self = Number(u.id) === Number(selfId);
            const tr = el('tr');
            const c1 = el('td'); c1.appendChild(el('b', '', u.full_name + (self ? ' (siz)' : ''))); c1.appendChild(document.createElement('br')); c1.appendChild(el('span', 'pg-muted', u.email));
            tr.appendChild(c1);
            const c2 = el('td');
            if (self) c2.textContent = ROLE[u.role] || u.role;
            else {
                const sel = el('select', 'pg-input'); sel.style.cssText = 'padding:6px 8px;width:auto'; sel.setAttribute('aria-label', u.full_name + ' roli');
                Object.keys(ROLE).forEach(function (k) { const o = el('option', '', ROLE[k]); o.value = k; sel.appendChild(o); });
                sel.value = u.role;
                sel.addEventListener('change', async function () {
                    const next = sel.value;
                    if (!window.confirm(u.full_name + ' roli "' + ROLE[next] + '" bo\'ladi. Davom etasizmi?')) { sel.value = u.role; return; }
                    sel.disabled = true;
                    try { await call('POST', '/admin/users/' + u.id + '/role', token, { role: next }); u.role = next; toast('Rol o\'zgartirildi'); }
                    catch (e) { if (e.auth) { onAuth(); return; } sel.value = u.role; toast('Rolni o\'zgartirib bo\'lmadi'); }
                    sel.disabled = false;
                });
                c2.appendChild(sel);
            }
            tr.appendChild(c2);
            const c3 = el('td'); const st = el('span', 'pg-pill' + (u.blocked ? ' coral' : ''), u.blocked ? 'Bloklangan' : 'Faol'); c3.appendChild(st);
            if (Number(u.email_verified) !== 1) { const w = el('span', 'pg-pill sun', 'Email tasdiqlanmagan'); w.style.marginLeft = '6px'; c3.appendChild(w); }
            tr.appendChild(c3);
            const cd = el('td', 'pg-muted', u.created_at ? new Date(u.created_at).toLocaleDateString('uz-UZ') : ''); cd.style.whiteSpace = 'nowrap'; tr.appendChild(cd);
            const c5 = el('td');
            if (!self) {
                const b = el('button', 'pg-btn danger', u.blocked ? 'Blokdan chiqarish' : 'Bloklash'); b.type = 'button'; b.style.padding = '8px 14px';
                let armed = null;
                b.addEventListener('click', async function () {
                    if (!u.blocked && !armed) { b.textContent = 'Aniqmi?'; armed = setTimeout(function () { armed = null; b.textContent = 'Bloklash'; }, 4000); return; }
                    if (armed) { clearTimeout(armed); armed = null; }
                    b.disabled = true;
                    try {
                        await call('POST', '/admin/users/' + u.id + '/block', token, { blocked: !u.blocked });
                        u.blocked = u.blocked ? 0 : 1; toast(u.blocked ? 'Foydalanuvchi bloklandi' : 'Blok olib tashlandi'); draw();
                    } catch (e) { if (e.auth) { onAuth(); return; } toast('Bajarib bo\'lmadi'); b.disabled = false; b.textContent = u.blocked ? 'Blokdan chiqarish' : 'Bloklash'; }
                });
                c5.appendChild(b);
            }
            tr.appendChild(c5);
            return tr;
        }
        async function load() {
            const mine = ++ticket;
            const qs = []; if (role) qs.push('role=' + role); if (search.value.trim()) qs.push('q=' + encodeURIComponent(search.value.trim()));
            card.textContent = ''; card.appendChild(el('p', 'pg-muted', 'Yuklanmoqda...'));
            try {
                const d = await call('GET', '/admin/users' + (qs.length ? '?' + qs.join('&') : ''), token);
                if (mine !== ticket) return;
                list = d.users; draw();
            } catch (e) {
                if (mine !== ticket) return;
                if (e.auth) { onAuth(); return; }
                card.textContent = ''; card.appendChild(el('p', 'pg-muted', 'Ro\'yxatni yuklab bo\'lmadi.'));
            }
        }
        search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(load, 300); });
        drawChips(); load();
    }

    window.AdminPanel = { home: home, users: users };
})();
