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
        const people = el('div', 'pg-card'); people.style.marginTop = '18px';
        people.appendChild(el('h3', '', 'Kurs guruhi'));
        const peopleBody = el('div', 'pg-muted', 'Yuklanmoqda...'); people.appendChild(peopleBody);
        left.appendChild(people);
        get('/teacher/courses/' + id + '/group', session).then(function (g) {
            peopleBody.textContent = '';
            peopleBody.className = '';
            const students = g.members.filter(function (m) { return m.role !== 'leader'; });
            const note = el('p', 'pg-muted', students.length ? students.length + ' ta o\'quvchi yozilgan' : 'Hali o\'quvchi yozilmagan. Kursni e\'lon qilgach, yozilganlar shu yerda ko\'rinadi.');
            peopleBody.appendChild(note);
            students.forEach(function (m) {
                const r = el('div', 'pg-row'); r.appendChild(el('b', '', m.full_name)); peopleBody.appendChild(r);
            });
        }).catch(function () { peopleBody.textContent = 'Guruhni yuklab bo\'lmadi.'; });

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

    // ---- Tasks and grading ----
    G.register('t-grading', async function (root, session) {
        root.textContent = '';
        const pg = el('div', 'pg'); root.appendChild(pg);
        pg.appendChild(head('Vazifalar va baholash', 'Kursga vazifa bering, javoblarni ko\'ring va baholang'));
        const courses = (await get('/teacher/courses', session)).courses || [];
        if (!courses.length) { pg.appendChild(el('p', 'pg-muted', 'Avval kurs yarating. Vazifalar kurslarga biriktiriladi.')); return; }

        const pick = el('select', 'pg-input');
        courses.forEach(function (c) { const o = el('option', '', c.title); o.value = c.id; pick.appendChild(o); });
        if (G.ctx.courseId && courses.some(function (c) { return c.id === G.ctx.courseId; })) pick.value = String(G.ctx.courseId);
        const pickBox = el('div', 'pg-card'); pickBox.appendChild(field('Kurs', pick, 'tgCourse')); pg.appendChild(pickBox);

        const form = el('form', 'pg-card'); form.noValidate = true; form.style.marginTop = '14px';
        form.appendChild(el('h3', '', 'Yangi vazifa'));
        const title = textInput('', 255, 'Vazifa nomi');
        const desc = textArea('', 5000); desc.placeholder = 'Nima qilish kerak?';
        const due = el('input', 'pg-input'); due.type = 'date';
        form.appendChild(field('Nomi', title, 'tgTitle')); form.appendChild(field('Tavsif', desc, 'tgDesc')); form.appendChild(field('Muddat (ixtiyoriy)', due, 'tgDue'));
        const fmsg = message();
        const add = el('button', 'pg-btn', 'Vazifa berish'); add.type = 'submit'; add.style.marginTop = '12px';
        form.appendChild(add); form.appendChild(fmsg); pg.appendChild(form);

        const list = el('div'); list.style.cssText = 'display:grid;gap:14px;margin-top:14px'; pg.appendChild(list);
        let openTask = null;

        function submissionBox(task, box) {
            box.textContent = 'Yuklanmoqda...';
            get('/teacher/tasks/' + task.id + '/submissions', session).then(function (subs) {
                box.textContent = '';
                if (!subs.length) { box.appendChild(el('p', 'pg-muted', 'Hali javob topshirilmagan.')); return; }
                subs.forEach(function (sb) {
                    const r = el('div', 'pg-card'); r.style.marginTop = '10px';
                    const top = el('div', 'pg-row');
                    top.appendChild(el('b', '', sb.student_name));
                    top.appendChild(el('span', 'pg-pill' + (sb.status === 'graded' ? '' : ' sun'), sb.status === 'graded' ? 'Baho: ' + Number(sb.grade) : 'Baholanmagan'));
                    r.appendChild(top);
                    const body = el('p', '', sb.content); body.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0';
                    r.appendChild(body);
                    const gf = el('form'); gf.noValidate = true;
                    const g = el('input', 'pg-input'); g.type = 'number'; g.min = 0; g.max = 100; g.step = 1; g.placeholder = 'Baho (0-100)'; g.setAttribute('aria-label', 'Baho');
                    if (sb.status === 'graded') g.value = Number(sb.grade);
                    const f = textInput(sb.feedback || '', 2000, 'Izoh (ixtiyoriy)'); f.setAttribute('aria-label', 'Izoh');
                    const gm = message();
                    const gb = el('button', 'pg-btn', sb.status === 'graded' ? 'Bahoni yangilash' : 'Baholash'); gb.type = 'submit'; gb.style.marginTop = '8px';
                    [g, f, gb, gm].forEach(function (n) { gf.appendChild(n); f === n && (n.style.marginTop = '8px'); });
                    gf.addEventListener('submit', async function (ev) {
                        ev.preventDefault(); gm.textContent = '';
                        const num = Number(g.value);
                        if (g.value === '' || !Number.isFinite(num) || num < 0 || num > 100) { gm.textContent = 'Bahoni 0 dan 100 gacha kiriting.'; return; }
                        gb.disabled = true;
                        try {
                            await send('POST', '/teacher/tasks/' + task.id + '/grade', session, { grade: num, feedback: f.value, student_id: sb.student_id });
                            G.toast('Baho saqlandi');
                            await load();
                        } catch (e) {
                            if (e.auth) { location.href = '../login/login.html'; return; }
                            gb.disabled = false; gm.textContent = errText(e);
                        }
                    });
                    r.appendChild(gf); box.appendChild(r);
                });
            }).catch(function (e) { if (e.auth) { location.href = '../login/login.html'; return; } box.textContent = 'Javoblarni yuklab bo\'lmadi.'; });
        }
        async function load() {
            const d = await get('/teacher/courses/' + pick.value + '/tasks', session);
            list.textContent = '';
            if (!d.tasks.length) { list.appendChild(el('p', 'pg-muted', 'Bu kursda hali vazifa yo\'q.')); return; }
            d.tasks.forEach(function (t) {
                const c = el('article', 'pg-card');
                c.appendChild(el('h3', '', t.title));
                const meta = el('div', 'pg-meta');
                if (t.dueDate) meta.appendChild(el('span', '', 'Muddat: ' + t.dueDate));
                meta.appendChild(el('span', '', t.submitted + '/' + t.students + ' topshirgan'));
                meta.appendChild(el('span', '', t.graded + ' baholangan'));
                c.appendChild(meta);
                const box = el('div');
                const b = btn(openTask === t.id ? 'Yopish' : 'Javoblar', 'ghost', function () {
                    openTask = openTask === t.id ? null : t.id; load();
                });
                b.style.marginTop = '10px';
                c.appendChild(b); c.appendChild(box);
                if (openTask === t.id) submissionBox(t, box);
                list.appendChild(c);
            });
        }
        pick.addEventListener('change', function () { openTask = null; G.ctx.courseId = Number(pick.value); load().catch(function () { list.textContent = 'Yuklab bo\'lmadi.'; }); });
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault(); fmsg.textContent = '';
            if (!title.value.trim()) { fmsg.textContent = 'Vazifa nomini kiriting.'; return; }
            add.disabled = true;
            try {
                await send('POST', '/teacher/tasks', session, { course_id: Number(pick.value), title: title.value, description: desc.value, due_date: due.value || undefined });
                title.value = ''; desc.value = ''; due.value = '';
                G.toast('Vazifa berildi');
                await load();
            } catch (e) {
                if (e.auth) { location.href = '../login/login.html'; return; }
                fmsg.textContent = errText(e);
            }
            add.disabled = false;
        });
        await load();
    });
})();
