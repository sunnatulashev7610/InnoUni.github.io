/* Real-data versions of the statistics pages: teacher home, students, statistics; student results and profile.
   Real session only. In demo mode the sample pages stay as they are. Needs dashboard-data.js. Text via textContent only. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get;

    const DAYS = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
    const dateText = (v) => new Date(v).toLocaleDateString('uz-UZ');
    function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); }
    function ago(v) {
        const m = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60000));
        if (m < 1) return 'hozir';
        if (m < 60) return m + ' daqiqa oldin';
        if (m < 1440) return Math.round(m / 60) + ' soat oldin';
        return Math.round(m / 1440) + ' kun oldin';
    }
    function page(root) { root.textContent = ''; const pg = el('div', 'pg'); root.appendChild(pg); return pg; }
    function head(title, sub) { const h = el('div', 'pg-head'); const d = el('div'); d.appendChild(el('h1', '', title)); d.appendChild(el('p', '', sub)); h.appendChild(d); return h; }
    function empty(text) { return el('p', 'pg-muted', text); }
    function card(title) { const c = el('section', 'pg-card'); if (title) c.appendChild(el('h3', 'pg-h3', title)); return c; }
    function bigCard(iconCls, value, label, tint) {
        const c = el('div', 'pg-card pg-file');
        const ic = el('div', 'ic'); ic.style.cssText = 'background:' + (tint || 'var(--brand-soft)') + ';color:var(--brand-ink);width:46px;height:46px;border-radius:12px;display:grid;place-items:center;flex:none';
        ic.appendChild(el('i', iconCls));
        const d = el('div'); const v = el('div', '', String(value)); v.style.cssText = 'font-size:24px;font-weight:800;line-height:1.1';
        d.appendChild(v); d.appendChild(el('div', 'pg-muted', label));
        c.appendChild(ic); c.appendChild(d); return c;
    }
    function cardRow() { const g = el('div', 'pg-grid'); g.style.cssText = 'grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-bottom:18px'; return g; }
    function bar(pct, color) {
        const b = el('div', 'pg-bar'); const i = document.createElement('i');
        i.style.width = Math.max(0, Math.min(100, pct)) + '%'; i.style.background = color || 'var(--brand-ink)'; b.appendChild(i); return b;
    }
    function chart(points, label) {
        const c = el('div', 'pg-chart'); c.setAttribute('role', 'img'); c.setAttribute('aria-label', label);
        const max = Math.max.apply(null, points.map(function (p) { return p.value; }).concat([1]));
        points.forEach(function (p) {
            const col = el('div', 'pg-col'); col.appendChild(el('b', '', String(p.value)));
            const i = document.createElement('i'); i.style.height = Math.round(100 * p.value / max) + '%'; col.appendChild(i);
            col.appendChild(el('span', '', p.label)); c.appendChild(col);
        });
        return c;
    }
    const avgText = (v) => (v === null || v === undefined ? '–' : String(v));

    // ---------------- Teacher: overview ----------------
    G.register('t-home', async function (root, session) {
        const s = await get('/summary/teacher', session);
        // The four cards above the page (they live in the dashboard shell)
        const cards = document.querySelectorAll('#mainOverview .stat-card');
        const vals = [[s.activeCourses, 'Faol kurslar'], [s.students, 'O\'quvchilar'], [s.gradedCount, 'Baholangan vazifalar'], [avgText(s.avgGrade), 'O\'rtacha ball']];
        cards.forEach(function (c, i) {
            if (!vals[i]) return;
            c.querySelector('.stat-value').textContent = String(vals[i][0]);
            c.querySelector('.stat-label').textContent = vals[i][1];
            const ch = c.querySelector('.stat-change'); if (ch) ch.style.display = 'none';   // no history is kept, so no "growth" figure
        });

        const pg = page(root);
        const wrap = el('div', 'pg-detail'); wrap.style.marginTop = '6px'; pg.appendChild(wrap);
        const left = el('div'); left.style.cssText = 'display:grid;gap:18px;align-content:start'; wrap.appendChild(left);
        const right = el('div'); right.style.cssText = 'display:grid;gap:18px;align-content:start'; wrap.appendChild(right);

        const mine = card('Kurslarim');
        if (!s.courses.length) mine.appendChild(empty('Hali kurs yaratmagansiz. "Kurs yaratish" bo\'limidan boshlang.'));
        s.courses.slice(0, 5).forEach(function (c) {
            const r = el('div', 'pg-lesson');
            const t = el('div'); t.style.flex = '1'; t.appendChild(el('b', '', c.title));
            t.appendChild(el('div', 'pg-muted', c.students + ' o\'quvchi · ' + c.tasks + ' vazifa'));
            r.appendChild(t); r.appendChild(el('span', 'pg-pill' + (c.status === 'active' ? '' : ' sun'), c.status === 'active' ? 'Nashr etilgan' : 'Qoralama'));
            mine.appendChild(r);
        });
        const all = el('button', 'pg-btn ghost', 'Barcha kurslar'); all.type = 'button'; all.style.marginTop = '12px';
        all.addEventListener('click', function () { G.open('t-courses', 't-courses'); }); mine.appendChild(all);
        left.appendChild(mine);

        const act = card('Haftalik faollik');
        act.appendChild(el('p', 'pg-muted', 'So\'nggi 7 kunda kelgan javoblar va yangi yozilganlar'));
        act.appendChild(chart(s.week.map(function (d) { return { value: d.count, label: DAYS[new Date(d.day + 'T00:00:00').getDay()] }; }), 'Haftalik faollik grafigi'));
        left.appendChild(act);

        const todo = card('Diqqat talab qiladi');
        const list = el('div'); list.style.cssText = 'display:grid;gap:10px';
        [[s.toGrade, ' ta javob baholashni kutmoqda', 't-grading', 'fas fa-clipboard-check'],
         [s.ordersPending, ' ta yangi buyurtma', 't-orders', 'fas fa-inbox'],
         [s.draftCourses, ' ta kurs qoralamada', 't-courses', 'fas fa-pen']].forEach(function (x) {
            if (!x[0]) return;
            const b = el('button', 'pg-todo'); b.type = 'button';
            const ic = el('span', 'ic'); ic.appendChild(el('i', x[3])); b.appendChild(ic);
            b.appendChild(el('b', '', x[0] + x[1])); b.appendChild(el('i', 'fas fa-chevron-right'));
            b.addEventListener('click', function () { G.open(x[2], x[2]); });
            list.appendChild(b);
        });
        if (!list.children.length) list.appendChild(empty('Hozircha hammasi joyida.'));
        todo.appendChild(list); right.appendChild(todo);

        const recent = card('So\'nggi faoliyat');
        if (!s.recent.length) recent.appendChild(empty('Hali faoliyat yo\'q.'));
        s.recent.forEach(function (r, i) {
            const row = el('div', 'pg-lesson');
            const av = el('span', 'pg-av', initials(r.who)); av.style.cssText = 'background:var(--c' + ((i % 6) + 1) + ');width:36px;height:36px;font-size:13px';
            const t = el('div'); t.style.flex = '1'; t.appendChild(el('b', '', r.who));
            t.appendChild(el('div', 'pg-muted', r.type === 'submission' ? '"' + r.what + '" vazifasini topshirdi' : '"' + r.what + '" kursiga yozildi'));
            row.appendChild(av); row.appendChild(t); row.appendChild(el('span', 'pg-muted', ago(r.at)));
            recent.appendChild(row);
        });
        right.appendChild(recent);
    });

    // ---------------- Teacher: students ----------------
    G.register('t-students', async function (root, session) {
        const d = await get('/summary/teacher/students', session);
        const pg = page(root);
        const hd = el('div', 'pg-head'); const dd = el('div');
        dd.appendChild(el('h1', '', 'O\'quvchilar')); dd.appendChild(el('p', '', 'Jami ' + new Set(d.students.map(function (x) { return x.id; })).size + ' o\'quvchi kurslaringizga yozilgan'));
        hd.appendChild(dd);
        const search = el('input', 'pg-input'); search.setAttribute('data-search', 'studentRows'); search.placeholder = 'Ism yoki kurs bo\'yicha qidirish...'; search.style.maxWidth = '320px'; search.setAttribute('aria-label', 'Qidirish');
        hd.appendChild(search); pg.appendChild(hd);
        if (!d.students.length) { pg.appendChild(empty('Hali o\'quvchi yozilmagan. Kursni e\'lon qiling, yozilganlar shu yerda ko\'rinadi.')); return; }
        const c = el('div', 'pg-card'); c.style.padding = '8px 14px';
        const w = el('div'); w.style.overflowX = 'auto';
        const t = el('table', 'pg-table'); const th = el('thead'); const hr = el('tr');
        ['O\'quvchi', 'Kurs', 'Progress', '', 'Oxirgi faollik', 'O\'rtacha ball'].forEach(function (h) { hr.appendChild(el('th', '', h)); });
        th.appendChild(hr); t.appendChild(th);
        const tb = el('tbody'); tb.id = 'studentRows';
        d.students.forEach(function (st, i) {
            const tr = el('tr');
            const c1 = el('td'); const f = el('div', 'pg-file');
            const av = el('span', 'pg-av', initials(st.name)); av.style.cssText = 'background:var(--c' + ((st.id % 6) + 1) + ');width:36px;height:36px;font-size:13px';
            f.appendChild(av); f.appendChild(el('b', '', st.name)); c1.appendChild(f); tr.appendChild(c1);
            tr.appendChild(el('td', 'pg-muted', st.course));
            const c3 = el('td'); c3.style.minWidth = '140px'; c3.appendChild(bar(st.progress)); tr.appendChild(c3);
            tr.appendChild(el('td', '', Math.round(st.progress) + '%'));
            tr.appendChild(el('td', 'pg-muted', ago(st.lastActive)));
            const c6 = el('td'); c6.appendChild(el('span', 'pg-pill', avgText(st.avgGrade))); tr.appendChild(c6);
            tb.appendChild(tr);
        });
        t.appendChild(tb); w.appendChild(t); c.appendChild(w); pg.appendChild(c);
    });

    // ---------------- Teacher: statistics (no money: there is no payment system yet) ----------------
    G.register('t-analytics', async function (root, session) {
        const s = await get('/summary/teacher', session);
        const pg = page(root);
        pg.appendChild(head('Statistika', 'Kurslaringiz natijalari'));
        const row = cardRow();
        row.appendChild(bigCard('fas fa-book', s.activeCourses, 'Nashr etilgan kurslar'));
        row.appendChild(bigCard('fas fa-user-plus', s.students, 'O\'quvchilar', 'var(--info-soft)'));
        row.appendChild(bigCard('fas fa-clipboard-check', s.tasksGiven, 'Berilgan vazifalar', 'var(--warn-soft)'));
        row.appendChild(bigCard('fas fa-star', avgText(s.avgGrade), 'O\'rtacha ball', 'var(--warn-soft)'));
        pg.appendChild(row);
        const c = card('Kurslar bo\'yicha');
        if (!s.courses.length) c.appendChild(empty('Hali kurs yo\'q.'));
        else {
            const w = el('div'); w.style.overflowX = 'auto';
            const t = el('table', 'pg-table'); const th = el('thead'); const hr = el('tr');
            ['Kurs', 'O\'quvchi', 'Vazifa', 'Javoblar', 'O\'rtacha ball'].forEach(function (h) { hr.appendChild(el('th', '', h)); });
            th.appendChild(hr); t.appendChild(th); const tb = el('tbody');
            s.courses.forEach(function (x) {
                const tr = el('tr'); const c1 = el('td'); c1.appendChild(el('b', '', x.title)); tr.appendChild(c1);
                [x.students, x.tasks, x.submitted, avgText(x.avgGrade)].forEach(function (v) { tr.appendChild(el('td', 'pg-muted', String(v))); });
                tb.appendChild(tr);
            });
            t.appendChild(tb); w.appendChild(t); c.appendChild(w);
        }
        pg.appendChild(c);
        const n = el('p', 'pg-muted', 'To\'lov tizimi ulangach, daromad statistikasi shu yerda ko\'rinadi.'); n.style.marginTop = '14px'; pg.appendChild(n);
    });

    // ---------------- Student: results ----------------
    G.register('results', async function (root, session) {
        const s = await get('/summary/student', session);
        const pg = page(root);
        pg.appendChild(head('Natijalar', 'Baholaringiz, o\'sishingiz va sertifikatlaringiz'));
        const row = cardRow();
        row.appendChild(bigCard('fas fa-star', avgText(s.avgGrade), 'O\'rtacha ball', 'var(--warn-soft)'));
        row.appendChild(bigCard('fas fa-clipboard-check', s.tasks.submitted + s.tasks.graded, 'Topshirilgan vazifa'));
        row.appendChild(bigCard('fas fa-book-open', s.activeCourses, 'Faol kurslar', 'var(--info-soft)'));
        row.appendChild(bigCard('fas fa-award', s.completedCourses, 'Tugatilgan kurslar', 'var(--warn-soft)'));
        pg.appendChild(row);

        const two = el('div', 'pg-detail'); two.style.marginBottom = '18px'; pg.appendChild(two);
        const dyn = card('Ball dinamikasi');
        dyn.appendChild(el('p', 'pg-muted', 'So\'nggi baholangan ishlaringiz'));
        const pts = s.recentGrades.slice().reverse().map(function (g, i) { return { value: Math.round(g.grade), label: String(i + 1) }; });
        if (pts.length) dyn.appendChild(chart(pts, 'Ball dinamikasi')); else dyn.appendChild(empty('Hali baholangan ish yo\'q.'));
        two.appendChild(dyn);
        const byc = card('Kurslar bo\'yicha');
        if (!s.courses.length) byc.appendChild(empty('Hali kursga yozilmagansiz.'));
        s.courses.forEach(function (c) {
            const w = el('div'); w.style.marginBottom = '16px';
            const m = el('div', 'pg-meta'); m.style.margin = '0 0 6px';
            const t = el('b', '', c.title); t.style.color = 'var(--ink)'; const p = el('b', '', Math.round(c.progress) + '%'); p.style.color = 'var(--ink)';
            m.appendChild(t); m.appendChild(p); w.appendChild(m); w.appendChild(bar(c.progress, 'var(--c' + ((c.id % 6) + 1) + ')')); byc.appendChild(w);
        });
        two.appendChild(byc);

        const gr = card('So\'nggi baholar');
        if (!s.recentGrades.length) gr.appendChild(empty('Hali baholangan ish yo\'q.'));
        else {
            const w = el('div'); w.style.overflowX = 'auto';
            const t = el('table', 'pg-table'); const th = el('thead'); const hr = el('tr');
            ['Vazifa', 'Kurs', 'Sana', 'Ball'].forEach(function (h) { hr.appendChild(el('th', '', h)); });
            th.appendChild(hr); t.appendChild(th); const tb = el('tbody');
            s.recentGrades.forEach(function (g) {
                const tr = el('tr'); const c1 = el('td'); c1.appendChild(el('b', '', g.task)); tr.appendChild(c1);
                tr.appendChild(el('td', 'pg-muted', g.course)); tr.appendChild(el('td', 'pg-muted', g.gradedAt ? dateText(g.gradedAt) : ''));
                const c4 = el('td'); c4.appendChild(el('span', 'pg-pill', Math.round(g.grade) + ' / 100')); tr.appendChild(c4); tb.appendChild(tr);
            });
            t.appendChild(tb); w.appendChild(t); gr.appendChild(w);
        }
        pg.appendChild(gr);

        // A certificate only for a course that is really finished
        const done = s.courses.filter(function (c) { return c.completed; })[0];
        if (done) {
            const h = el('div', 'pg-head'); h.style.marginTop = '28px';
            const d = el('div'); const h2 = el('h2', '', 'Sertifikat'); h2.style.cssText = 'font-size:22px;font-weight:800;margin:0';
            const sub = el('p', 'pg-muted', '"' + done.title + '" kursini muvaffaqiyatli tugatdingiz'); sub.style.margin = '4px 0 0';
            d.appendChild(h2); d.appendChild(sub); h.appendChild(d);
            const pr = el('button', 'pg-btn sun', 'PDF yuklab olish'); pr.type = 'button'; pr.addEventListener('click', function () { window.print(); }); h.appendChild(pr);
            pg.appendChild(h);
            const cert = el('div', 'pg-cert'); const inn = el('div', 'pg-cert-in');
            inn.appendChild(el('div', 'k', 'GATHER EDU · SERTIFIKAT'));
            inn.appendChild(el('div', 't', 'Ushbu sertifikat tasdiqlaydi'));
            inn.appendChild(el('div', 'name', session.name || ''));
            inn.appendChild(el('div', 't', '"' + done.title + '" kursini muvaffaqiyatli yakunladi'));
            if (done.teacher) { const f = el('div', 'foot'); const x = el('div'); x.appendChild(el('div', 'line')); x.appendChild(document.createTextNode(done.teacher)); x.appendChild(el('small', '', 'Kurs o\'qituvchisi')); f.appendChild(x); inn.appendChild(f); }
            cert.appendChild(inn); pg.appendChild(cert);
        }
    });

    // ---------------- Profile (both roles): real name, email, role and numbers; nothing invented ----------------
    G.register('profile', async function (root, session) {
        const teacher = session.role === 'teacher';
        let user = {}; try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch (e) { /* ignore */ }
        const s = await get(teacher ? '/summary/teacher' : '/summary/student', session);
        // Current values come from the server (the saved copy in localStorage may be older)
        try { const me = await get('/auth/profile', session); if (me && me.user) user = Object.assign({}, user, me.user); } catch (e) { if (e.auth) throw e; }
        const pg = page(root);
        pg.appendChild(head('Profil', 'Hisobingiz haqida ma\'lumot'));
        const top = el('div', 'pg-card pg-file'); top.style.marginBottom = '18px';
        const av = el('span', 'pg-av', initials(user.full_name || session.name)); av.style.cssText = 'background:var(--c1);width:64px;height:64px;font-size:22px'; top.appendChild(av);
        const d = el('div'); const n = el('h2', '', user.full_name || session.name || 'Foydalanuvchi'); n.style.margin = '0';
        d.appendChild(n);
        d.appendChild(el('div', 'pg-muted', teacher ? 'O\'qituvchi' : 'O\'quvchi'));
        const mail = el('div', 'pg-muted', user.email || ''); d.appendChild(mail);
        const bioLine = el('div', 'pg-muted', user.bio || ''); bioLine.style.marginTop = '4px'; d.appendChild(bioLine);
        top.appendChild(d); pg.appendChild(top);

        const row = cardRow();
        if (teacher) {
            row.appendChild(bigCard('fas fa-book', s.activeCourses, 'Nashr etilgan kurslar'));
            row.appendChild(bigCard('fas fa-user-plus', s.students, 'O\'quvchilar', 'var(--info-soft)'));
            row.appendChild(bigCard('fas fa-clipboard-check', s.gradedCount, 'Baholangan vazifalar', 'var(--warn-soft)'));
            row.appendChild(bigCard('fas fa-star', avgText(s.avgGrade), 'O\'rtacha ball', 'var(--warn-soft)'));
        } else {
            row.appendChild(bigCard('fas fa-book-open', s.activeCourses, 'Faol kurslar'));
            row.appendChild(bigCard('fas fa-trophy', s.completedCourses, 'Tugatilgan kurslar', 'var(--warn-soft)'));
            row.appendChild(bigCard('fas fa-clipboard-check', s.tasks.submitted + s.tasks.graded, 'Topshirilgan vazifalar', 'var(--info-soft)'));
            row.appendChild(bigCard('fas fa-users', s.groups, 'Guruhlar', 'var(--warn-soft)'));
        }
        pg.appendChild(row);

        if (!teacher) {
            // Achievements that are earned for real; the rest stay hidden
            const ach = [];
            if (s.tasks.submitted + s.tasks.graded >= 1) ach.push(['fas fa-code', 'Birinchi qadam', 'Birinchi vazifani topshirdi']);
            if (s.tasks.graded >= 5) ach.push(['fas fa-star', 'Faol o\'quvchi', '5 ta ish baholandi']);
            if (s.groups >= 1) ach.push(['fas fa-users', 'Guruh a\'zosi', 'Kurs guruhiga qo\'shildi']);
            if (s.completedCourses >= 1) ach.push(['fas fa-certificate', 'Kursni tugatdi', s.completedCourses + ' ta kurs tugatildi']);
            const c = card('Yutuqlar');
            if (!ach.length) c.appendChild(empty('Hali yutuq yo\'q. Birinchi vazifani topshiring.'));
            ach.forEach(function (a) {
                const r = el('div', 'pg-lesson'); const ic = el('span', 'ic'); ic.appendChild(el('i', a[0]));
                const t = el('div'); t.style.flex = '1'; t.appendChild(el('b', '', a[1])); t.appendChild(el('div', 'pg-muted', a[2]));
                r.appendChild(ic); r.appendChild(t); c.appendChild(r);
            });
            pg.appendChild(c);
        }

        // ---- Edit profile ----
        function field(label, input, id) {
            const w = el('div'); const l = el('label', 'pg-lbl', label); l.htmlFor = id; input.id = id;
            w.appendChild(l); w.appendChild(input); return w;
        }
        function input(type, value, max) { const i = el('input', 'pg-input'); i.type = type; i.maxLength = max; i.value = value || ''; return i; }
        function note() { const m = el('p', 'pg-muted'); m.setAttribute('role', 'alert'); m.style.cssText = 'min-height:1.2em;margin-top:10px'; return m; }

        const form = el('form'); form.noValidate = true;
        const edit = card('Ma\'lumotlarni tahrirlash'); edit.style.marginTop = '18px';
        const iName = input('text', user.full_name || session.name, 100); iName.autocomplete = 'name';
        const iMail = input('email', user.email, 255); iMail.autocomplete = 'email';
        const iPhone = input('tel', user.phone, 20); iPhone.placeholder = '+998 90 123 45 67'; iPhone.autocomplete = 'tel';
        const iBio = el('textarea', 'pg-input'); iBio.rows = 3; iBio.maxLength = 500; iBio.value = user.bio || ''; iBio.placeholder = 'O\'zingiz haqingizda qisqacha';
        form.appendChild(field('To\'liq ism', iName, 'pfName'));
        form.appendChild(field('Email', iMail, 'pfEmail'));
        form.appendChild(field('Telefon', iPhone, 'pfPhone'));
        form.appendChild(field('Qisqacha o\'zim haqimda', iBio, 'pfBio'));
        const msg = note(); form.appendChild(msg);
        const save = el('button', 'pg-btn', 'Saqlash'); save.type = 'submit'; form.appendChild(save);
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            msg.textContent = '';
            if (iName.value.trim().length < 2) { msg.textContent = 'Ismni kiriting (kamida 2 belgi).'; return; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(iMail.value.trim())) { msg.textContent = 'Email noto\'g\'ri.'; return; }
            save.disabled = true; save.textContent = 'Saqlanmoqda...';
            try {
                const out = await G.api.send('PUT', '/auth/profile', session, { full_name: iName.value, email: iMail.value, phone: iPhone.value, bio: iBio.value });
                const u = out.user || {};
                let stored = {}; try { stored = JSON.parse(localStorage.getItem('user') || '{}'); } catch (x) { /* ignore */ }
                try { localStorage.setItem('user', JSON.stringify(Object.assign(stored, u))); } catch (x) { /* storage may be blocked */ }
                session.name = u.full_name || session.name;
                const hdr = document.getElementById('userName'); if (hdr) hdr.textContent = session.name;
                n.textContent = session.name; mail.textContent = u.email || ''; bioLine.textContent = u.bio || '';
                av.textContent = initials(session.name);
                iName.value = u.full_name || ''; iMail.value = u.email || ''; iPhone.value = u.phone || ''; iBio.value = u.bio || '';
                G.toast('Profil saqlandi');
            } catch (err) {
                if (err.auth) { msg.textContent = 'Sessiya tugagan. Qayta kiring.'; return; }
                msg.textContent = /taken/i.test(err.message) ? 'Bu email band.' : /email/i.test(err.message) ? 'Email noto\'g\'ri.' : /phone/i.test(err.message) ? 'Telefon raqami noto\'g\'ri.' : 'Saqlab bo\'lmadi. Keyinroq urinib ko\'ring.';
            } finally { save.disabled = false; save.textContent = 'Saqlash'; }
        });
        edit.appendChild(form); pg.appendChild(edit);

        // ---- Change password ----
        const pass = card('Parolni o\'zgartirish'); pass.style.marginTop = '18px';
        const pform = el('form'); pform.noValidate = true;
        const pOld = input('password', '', 72); pOld.autocomplete = 'current-password';
        const pNew = input('password', '', 72); pNew.autocomplete = 'new-password';
        const pNew2 = input('password', '', 72); pNew2.autocomplete = 'new-password';
        pform.appendChild(field('Joriy parol', pOld, 'pfOld'));
        pform.appendChild(field('Yangi parol (kamida 8 belgi)', pNew, 'pfNew'));
        pform.appendChild(field('Yangi parolni takrorlang', pNew2, 'pfNew2'));
        const pmsg = note(); pform.appendChild(pmsg);
        const psave = el('button', 'pg-btn', 'Parolni yangilash'); psave.type = 'submit'; pform.appendChild(psave);
        pform.addEventListener('submit', async function (e) {
            e.preventDefault();
            pmsg.textContent = '';
            if (!pOld.value) { pmsg.textContent = 'Joriy parolni kiriting.'; return; }
            if (pNew.value.length < 8) { pmsg.textContent = 'Yangi parol kamida 8 belgi bo\'lsin.'; return; }
            if (pNew.value !== pNew2.value) { pmsg.textContent = 'Yangi parollar bir xil emas.'; return; }
            psave.disabled = true; psave.textContent = 'Yangilanmoqda...';
            try {
                await G.api.send('PUT', '/auth/password', session, { current_password: pOld.value, new_password: pNew.value });
                pOld.value = ''; pNew.value = ''; pNew2.value = '';
                G.toast('Parol yangilandi');
            } catch (err) {
                // The server answers 401 for a wrong current password
                if (err.auth) { pmsg.textContent = 'Joriy parol noto\'g\'ri.'; return; }
                pmsg.textContent = /incorrect/i.test(err.message) ? 'Joriy parol noto\'g\'ri.' : /Too many/i.test(err.message) ? 'Juda ko\'p urinish. Keyinroq urinib ko\'ring.' : /at (least|most)/i.test(err.message) ? 'Yangi parol talabga mos emas (8-72 belgi).' : 'Parolni yangilab bo\'lmadi.';
            } finally { psave.disabled = false; psave.textContent = 'Parolni yangilash'; }
        });
        pass.appendChild(pform); pg.appendChild(pass);
    });
})();
