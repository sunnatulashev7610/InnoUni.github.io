/* Teacher pages of the dashboard: course list, create form, course editor.
   Runs only with a real session. Needs dashboard-data.js (window.GEData). All text is set with textContent. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el;
    const get = G.api.get;
    const send = G.api.send;
    const CATEGORIES = ['Frontend', 'Backend', 'Dizayn', 'Mobil', 'Til', 'Boshqa'];

    function errText(e) {
        return (e && e.message) ? e.message : 'Xatolik, qayta urinib ko\'ring';
    }
    function icon(cls) { return el('i', cls); }
    function btn(label, cls, onClick, iconCls) {
        const b = el('button', 'pg-btn ' + (cls || ''));
        b.type = 'button';
        if (iconCls) { b.appendChild(icon(iconCls)); b.appendChild(document.createTextNode(' ')); }
        b.appendChild(document.createTextNode(label));
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }
    function head(title, sub, action) {
        const h = el('div', 'pg-head');
        const d = el('div');
        d.appendChild(el('h1', '', title));
        d.appendChild(el('p', '', sub));
        h.appendChild(d);
        if (action) h.appendChild(action);
        return h;
    }
    function field(label, input, id) {
        const wrap = el('div');
        const l = el('label', 'pg-lbl', label); l.htmlFor = id;
        input.id = id;
        wrap.appendChild(l); wrap.appendChild(input);
        return wrap;
    }
    function categorySelect(value) {
        const sel = el('select', 'pg-input');
        const list = CATEGORIES.indexOf(value) === -1 && value ? CATEGORIES.concat([value]) : CATEGORIES;
        list.forEach(function (c) { const o = el('option', '', c); o.value = c; if (c === value) o.selected = true; sel.appendChild(o); });
        return sel;
    }
    function textInput(value, max, placeholder) {
        const i = el('input', 'pg-input'); i.type = 'text'; i.maxLength = max; i.value = value || '';
        if (placeholder) i.placeholder = placeholder;
        return i;
    }
    function textArea(value, max) {
        const t = el('textarea', 'pg-input'); t.rows = 4; t.maxLength = max; t.value = value || '';
        t.placeholder = 'Kurs nimani o\'rgatadi?';
        return t;
    }
    function message() {
        const m = el('p', 'pg-muted'); m.setAttribute('role', 'alert'); m.style.minHeight = '1.2em'; m.style.marginTop = '10px';
        return m;
    }
    function statusPill(status) {
        return status === 'active' ? el('span', 'pg-pill', 'Nashr etilgan') : el('span', 'pg-pill sun', 'Qoralama');
    }
    function reset(root) {
        const pg = root.querySelector('.pg') || root;
        pg.textContent = '';
        return pg;
    }

    // ---- My courses ----
    G.register('t-courses', async function (root, session) {
        const pg = reset(root);
        pg.appendChild(head('Mening kurslarim', 'Yaratgan kurslaringizni boshqaring',
            btn('Yangi kurs', 'sun', function () { G.open('t-create', 't-create'); }, 'fas fa-plus')));
        const chips = el('div', 'pg-chips'); chips.setAttribute('data-managed', '');
        const grid = el('div', 'pg-grid'); grid.id = 'pgFilterTarget';
        pg.appendChild(chips); pg.appendChild(grid);
        grid.textContent = 'Yuklanmoqda...';

        const data = await get('/teacher/courses', session);
        const courses = data.courses || [];
        let filter = 'all';

        function drawChips() {
            chips.textContent = '';
            [['all', 'Hammasi'], ['active', 'Nashr etilgan'], ['inactive', 'Qoralama']].forEach(function (p) {
                const b = el('button', 'pg-chip' + (filter === p[0] ? ' on' : ''), p[1]);
                b.type = 'button'; b.dataset.cat = p[0];
                b.addEventListener('click', function () { filter = p[0]; drawChips(); drawGrid(); });
                chips.appendChild(b);
            });
        }
        function card(c) {
            const a = el('article', 'pg-card pg-item');
            const cover = el('div', 'pg-cover', String(c.title || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''));
            cover.style.background = 'var(--c' + ((c.id % 6) + 1) + ')';
            a.appendChild(cover);
            a.appendChild(statusPill(c.status));
            const h = el('h3', '', c.title); h.style.marginTop = '10px'; a.appendChild(h);
            const meta = el('div', 'pg-meta');
            meta.appendChild(el('span', '', c.videos + ' video'));
            meta.appendChild(el('span', '', c.guides + ' qo\'llanma'));
            meta.appendChild(el('span', '', c.students + ' o\'quvchi'));
            a.appendChild(meta);
            const msg = message(); msg.style.fontSize = '.85rem';
            const row = el('div'); row.style.cssText = 'display:flex;gap:8px;margin-top:16px';
            const edit = btn('Tahrirlash', 'ghost', function () { G.ctx.courseId = c.id; G.open('t-course-edit', 't-courses'); }, 'fas fa-pen');
            const toggle = btn(c.status === 'active' ? 'Yashirish' : 'E\'lon qilish', 'ghost', async function () {
                toggle.disabled = true; msg.textContent = '';
                try {
                    const next = c.status === 'active' ? 'inactive' : 'active';
                    await send('PUT', '/teacher/courses/' + c.id, session, { status: next });
                    c.status = next;
                    drawGrid();
                } catch (e) {
                    if (e.auth) { location.href = '../login/login.html'; return; }
                    toggle.disabled = false;
                    msg.textContent = /content|item/i.test(errText(e)) ? 'Avval kamida bitta video yoki qo\'llanma qo\'shing.' : errText(e);
                }
            });
            [edit, toggle].forEach(function (b) { b.style.cssText = 'flex:1;justify-content:center'; row.appendChild(b); });
            a.appendChild(row); a.appendChild(msg);
            return a;
        }
        function drawGrid() {
            grid.textContent = '';
            const shown = courses.filter(function (c) { return filter === 'all' || c.status === filter; });
            if (!shown.length) {
                grid.appendChild(el('p', 'pg-muted', courses.length ? 'Bu bo\'limda kurs yo\'q.' : 'Hali kurs yaratmagansiz. "Yangi kurs" tugmasini bosing.'));
                return;
            }
            shown.forEach(function (c) { grid.appendChild(card(c)); });
        }
        drawChips(); drawGrid();
    });

    // ---- Create ----
    G.register('t-create', async function (root, session) {
        const pg = reset(root);
        pg.appendChild(head('Yangi kurs', 'Avval asosiy ma\'lumotlar, keyin video va qo\'llanmalarni qo\'shasiz'));
        const form = el('form', 'pg-card'); form.noValidate = true;
        const title = textInput('', 120, 'Masalan: Python asoslari');
        const cat = categorySelect('Frontend');
        const desc = textArea('', 2000);
        form.appendChild(field('Kurs nomi', title, 'cTitleReal'));
        form.appendChild(field('Kategoriya', cat, 'cCatReal'));
        form.appendChild(field('Tavsif', desc, 'cDescReal'));
        const msg = message();
        const row = el('div'); row.style.cssText = 'display:flex;gap:10px;margin-top:14px';
        const save = el('button', 'pg-btn'); save.type = 'submit'; save.textContent = 'Yaratish';
        row.appendChild(save);
        row.appendChild(btn('Bekor qilish', 'ghost', function () { G.open('t-courses', 't-courses'); }));
        form.appendChild(row); form.appendChild(msg);
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            msg.textContent = '';
            if (!title.value.trim()) { msg.textContent = 'Kurs nomini kiriting.'; return; }
            save.disabled = true;
            try {
                const r = await send('POST', '/teacher/courses', session, { title: title.value, category: cat.value, description: desc.value });
                G.ctx.courseId = r.courseId;
                G.open('t-course-edit', 't-courses');
            } catch (e) {
                if (e.auth) { location.href = '../login/login.html'; return; }
                save.disabled = false;
                msg.textContent = errText(e);
            }
        });
        pg.appendChild(form);
    });

    // ---- Editor ----
    G.register('t-course-edit', async function (root, session) {
        const pg = reset(root);
        const id = G.ctx.courseId;
        if (!id) { G.open('t-courses', 't-courses'); return; }
        const data = await get('/teacher/courses/' + id + '/content', session);
        let course = data.course;
        let items = data.items || [];

        pg.appendChild(head('Kursni tahrirlash', 'Ma\'lumot, video darslar va qo\'llanmalar',
            btn('Kurslarimga qaytish', 'ghost', function () { G.open('t-courses', 't-courses'); }, 'fas fa-arrow-left')));
        const wrap = el('div', 'pg-detail'); pg.appendChild(wrap);
        const left = el('div'); wrap.appendChild(left);

        // info form
        const info = el('form', 'pg-card'); info.noValidate = true;
        const title = textInput(course.title, 120);
        const cat = categorySelect(course.category);
        const desc = textArea(course.description, 2000);
        info.appendChild(field('Kurs nomi', title, 'eTitle'));
        info.appendChild(field('Kategoriya', cat, 'eCat'));
        info.appendChild(field('Tavsif', desc, 'eDesc'));
        const infoMsg = message();
        const saveInfo = el('button', 'pg-btn', 'Saqlash'); saveInfo.type = 'submit'; saveInfo.style.marginTop = '14px';
        info.appendChild(saveInfo); info.appendChild(infoMsg);
        info.addEventListener('submit', async function (ev) {
            ev.preventDefault(); infoMsg.textContent = ''; saveInfo.disabled = true;
            try {
                await send('PUT', '/teacher/courses/' + id, session, { title: title.value, category: cat.value, description: desc.value });
                G.toast('Saqlandi');
            } catch (e) {
                if (e.auth) { location.href = '../login/login.html'; return; }
                infoMsg.textContent = errText(e);
            }
            saveInfo.disabled = false;
        });
        left.appendChild(info);

        // content lists
        const lists = el('div'); lists.style.marginTop = '18px'; left.appendChild(lists);
        const listMsg = message();

        async function call(method, path, body) {
            listMsg.textContent = '';
            try {
                await send(method, path, session, body);
                const fresh = await get('/teacher/courses/' + id + '/content', session);
                course = fresh.course; items = fresh.items || [];
                draw();
            } catch (e) {
                if (e.auth) { location.href = '../login/login.html'; return; }
                listMsg.textContent = errText(e);
            }
        }
        function section(kind, label) {
            const box = el('div', 'pg-card'); box.style.marginTop = '14px';
            box.appendChild(el('h3', '', label));
            const mine = items.filter(function (x) { return x.kind === kind; });
            if (!mine.length) box.appendChild(el('p', 'pg-muted', kind === 'video' ? 'Hali video yo\'q.' : 'Hali qo\'llanma yo\'q.'));
            mine.forEach(function (it, i) {
                const r = el('div', 'pg-row');
                const t = el('div');
                t.appendChild(el('b', '', it.title));
                const a = el('a', 'pg-muted', it.url);
                a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
                a.style.cssText = 'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px';
                t.appendChild(a);
                const ctl = el('div'); ctl.style.cssText = 'display:flex;gap:6px';
                const up = btn('', 'ghost', function () { call('POST', '/teacher/courses/' + id + '/content/' + it.id + '/move', { direction: 'up' }); }, 'fas fa-arrow-up');
                const down = btn('', 'ghost', function () { call('POST', '/teacher/courses/' + id + '/content/' + it.id + '/move', { direction: 'down' }); }, 'fas fa-arrow-down');
                const del = btn('', 'ghost', function () { call('DELETE', '/teacher/courses/' + id + '/content/' + it.id); }, 'fas fa-trash');
                up.setAttribute('aria-label', 'Yuqoriga'); down.setAttribute('aria-label', 'Pastga'); del.setAttribute('aria-label', 'O\'chirish');
                up.disabled = i === 0; down.disabled = i === mine.length - 1;
                [up, down, del].forEach(function (b) { ctl.appendChild(b); });
                r.appendChild(t); r.appendChild(ctl); box.appendChild(r);
            });
            return box;
        }
        function draw() {
            lists.textContent = '';
            lists.appendChild(section('video', 'Video darslar'));
            lists.appendChild(section('guide', 'Qo\'llanmalar'));
            lists.appendChild(listMsg);
            drawSide();
        }

        // side: status + add form
        const side = el('aside'); side.style.cssText = 'align-self:start'; wrap.appendChild(side);
        function drawSide() {
            side.textContent = '';
            const st = el('div', 'pg-card');
            st.appendChild(el('div', 'pg-muted', 'Holati'));
            const p = statusPill(course.status); p.style.marginTop = '6px'; st.appendChild(p);
            const m = message();
            const toggle = btn(course.status === 'active' ? 'Yashirish' : 'E\'lon qilish', 'sun', async function () {
                toggle.disabled = true; m.textContent = '';
                try {
                    await send('PUT', '/teacher/courses/' + id, session, { status: course.status === 'active' ? 'inactive' : 'active' });
                    course.status = course.status === 'active' ? 'inactive' : 'active';
                    drawSide();
                } catch (e) {
                    if (e.auth) { location.href = '../login/login.html'; return; }
                    toggle.disabled = false;
                    m.textContent = items.length ? errText(e) : 'Avval kamida bitta video yoki qo\'llanma qo\'shing.';
                }
            });
            toggle.style.marginTop = '12px';
            st.appendChild(toggle); st.appendChild(m);
            side.appendChild(st);

            const add = el('form', 'pg-card'); add.noValidate = true; add.style.marginTop = '14px';
            add.appendChild(el('h3', '', 'Qo\'shish'));
            const kind = el('select', 'pg-input');
            [['video', 'Video dars'], ['guide', 'Qo\'llanma']].forEach(function (k) { const o = el('option', '', k[1]); o.value = k[0]; kind.appendChild(o); });
            const t = textInput('', 200, 'Sarlavha');
            const u = textInput('', 500, 'https://...'); u.type = 'url';
            add.appendChild(field('Turi', kind, 'addKind'));
            add.appendChild(field('Sarlavha', t, 'addTitle'));
            add.appendChild(field('Havola (YouTube, Drive, PDF...)', u, 'addUrl'));
            const am = message();
            const go = el('button', 'pg-btn', 'Qo\'shish'); go.type = 'submit'; go.style.marginTop = '12px';
            add.appendChild(go); add.appendChild(am);
            add.addEventListener('submit', async function (ev) {
                ev.preventDefault(); am.textContent = '';
                if (!t.value.trim() || !u.value.trim()) { am.textContent = 'Sarlavha va havolani kiriting.'; return; }
                go.disabled = true;
                try {
                    await send('POST', '/teacher/courses/' + id + '/content', session, { kind: kind.value, title: t.value, url: u.value });
                    const fresh = await get('/teacher/courses/' + id + '/content', session);
                    course = fresh.course; items = fresh.items || [];
                    draw();
                } catch (e) {
                    if (e.auth) { location.href = '../login/login.html'; return; }
                    go.disabled = false;
                    am.textContent = errText(e);
                }
            });
            side.appendChild(add);
        }
        draw();
    });
})();
