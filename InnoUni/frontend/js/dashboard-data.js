// Fills the dashboard pages with the signed-in user's real data.
// Pages are static fragments; hydrate(page, root, session) runs after one is inserted.
// Without a session (demo mode) nothing is called and the sample content stays.
(function () {
    function apiBase() { return (window.config && window.config.apiBaseUrl) || '/api'; }

    async function get(path, session) {
        const res = await fetch(apiBase() + path, { headers: { Authorization: 'Bearer ' + session.token } });
        if (res.status === 401 || res.status === 403) {
            const err = new Error('auth');
            err.auth = true;
            throw err;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }

    async function send(method, path, session, body) {
        const headers = { Authorization: 'Bearer ' + session.token };
        const init = { method: method, headers: headers };
        if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
        const res = await fetch(apiBase() + path, init);
        if (res.status === 401) { const err = new Error('auth'); err.auth = true; throw err; }
        const out = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(out.error || 'HTTP ' + res.status);
        return out;
    }

    function ago(ts) {
        const min = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
        if (min < 1) return 'hozir';
        if (min < 60) return min + ' daqiqa oldin';
        if (min < 1440) return Math.round(min / 60) + ' soat oldin';
        if (min < 43200) return Math.round(min / 1440) + ' kun oldin';
        return Math.round(min / 43200) + ' oy oldin';
    }

    function activityText(a) {
        const t = '"' + a.title + '"';
        if (a.type === 'course') return t + ' kursiga yozildingiz';
        if (a.type === 'task') return t + ' vazifasini tugatdingiz';
        if (a.type === 'group') return t + ' guruhiga qo\'shildingiz';
        if (a.type === 'achievement') return t + ' yutug\'ini oldingiz';
        return t;
    }
    const KIND = { course: 'course', task: 'course', group: 'team', achievement: 'achievement' };

    function setFill(card, pct) {
        const f = card && card.querySelector('.progress-fill');
        if (f) f.style.width = Math.max(0, Math.min(100, Math.round(pct))) + '%';
    }

    function renderActivity(list, items) {
        list.textContent = '';
        if (!items.length) {
            const p = document.createElement('p');
            p.className = 'fg-muted';
            p.textContent = 'Hali faoliyat yo\'q. Kurslar bo\'limidan boshlang.';
            list.appendChild(p);
            return;
        }
        items.forEach(function (a) {
            const row = document.createElement('div'); row.className = 'activity-item';
            const ic = document.createElement('div'); ic.className = 'activity-icon ' + (KIND[a.type] || 'course');
            const i = document.createElement('i'); i.className = 'fas ' + (/^fa-[a-z-]+$/.test(a.icon || '') ? a.icon : 'fa-circle');
            ic.appendChild(i);
            const d = document.createElement('div'); d.className = 'activity-details';
            const t = document.createElement('div'); t.className = 'activity-title'; t.textContent = activityText(a);
            const m = document.createElement('div'); m.className = 'activity-time'; m.textContent = ago(a.timestamp);
            d.append(t, m); row.append(ic, d); list.appendChild(row);
        });
    }

    const pages = {
        'main.dashboard': async function (root, session) {
            const cards = root.querySelectorAll('.stat-card');
            const nums = root.querySelectorAll('.stat-number');
            const list = root.querySelector('.activity-list');
            const first = (session.name || '').split(' ')[0];
            const h = root.querySelector('.home-user h3');
            if (h) h.textContent = first ? 'Xush kelibsiz, ' + first + '!' : 'Xush kelibsiz!';
            // Hide the sample numbers until the real ones arrive
            nums.forEach(function (n) { n.textContent = '–'; });
            cards.forEach(function (c) { setFill(c, 0); });
            if (list) list.textContent = 'Yuklanmoqda...';

            const [sum, activity] = await Promise.all([
                get('/summary/student', session),
                get('/dashboard/activity/' + session.id + '?limit=6', session)
            ]);
            const t = sum.tasks;
            const total = t.todo + t.submitted + t.graded;
            // The 4th card used to show a "streak" that nothing records; it now shows the real average grade
            const last = cards[3];
            if (last) {
                const lab = last.querySelector('.stat-label'); if (lab) lab.textContent = 'O\'rtacha ball';
                const ic = last.querySelector('.stat-icon i'); if (ic) ic.className = 'fas fa-star';
            }
            const v = [sum.activeCourses, t.dueSoon + t.overdue, sum.groups, sum.avgGrade === null ? '–' : sum.avgGrade];
            nums.forEach(function (n, i) { if (v[i] !== undefined) n.textContent = String(v[i]); });
            const prog = sum.courses.length ? sum.courses.reduce(function (a, c) { return a + c.progress; }, 0) / sum.courses.length : 0;
            setFill(cards[0], prog);
            setFill(cards[1], total ? 100 * (t.submitted + t.graded) / total : 0);
            setFill(cards[2], sum.groups ? 100 : 0);
            setFill(cards[3], sum.avgGrade || 0);
            if (list) renderActivity(list, activity);
        }
    };


    // ---- Courses (student) ----
    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }
    function initials(title) {
        const w = String(title || '?').trim().split(/\s+/).slice(0, 2);
        return w.map(function (x) { return x.charAt(0).toUpperCase(); }).join('');
    }
    const PILLS = ['', 'sky', 'sun'];

    function courseCard(c, onEnroll) {
        const card = el('article', 'pg-card pg-item');
        card.dataset.cat = (c.category || '').toLowerCase();
        card.dataset.mine = c.enrolled ? '1' : '0';
        const cover = el('div', 'pg-cover', initials(c.title));
        cover.style.background = 'var(--c' + ((c.id % 6) + 1) + ')';
        card.appendChild(cover);
        if (c.category) card.appendChild(el('span', 'pg-pill ' + PILLS[c.id % PILLS.length], c.category));
        const h = el('h3', '', c.title); h.style.marginTop = '10px'; card.appendChild(h);
        card.appendChild(el('div', 'pg-muted', c.teacher || 'O\'qituvchi belgilanmagan'));
        if (c.description) { const d = el('p', 'pg-muted', c.description); d.style.cssText = 'margin:8px 0 0;font-size:.88rem'; card.appendChild(d); }
        if (c.enrolled) {
            const bar = el('div', 'pg-bar'); bar.style.marginTop = '14px';
            const i = document.createElement('i'); i.style.width = Math.max(0, Math.min(100, c.progress)) + '%'; i.style.background = 'var(--c' + ((c.id % 6) + 1) + ')';
            bar.appendChild(i); card.appendChild(bar);
        }
        const meta = el('div', 'pg-meta');
        meta.appendChild(el('span', '', c.students + ' o\'quvchi'));
        if (c.enrolled) {
            const pct = el('b', '', Math.round(c.progress) + '%'); pct.style.color = 'var(--ink)'; meta.appendChild(pct);
        } else {
            const b = el('button', 'pg-btn sun', 'Yozilish'); b.type = 'button'; b.style.padding = '6px 14px';
            b.addEventListener('click', function () { onEnroll(c, b); });
            meta.appendChild(b);
        }
        card.appendChild(meta);
        if (c.enrolled) {
            const open = el('button', 'pg-btn ghost', 'Darslarni ochish'); open.type = 'button';
            open.style.cssText = 'width:100%;justify-content:center;margin-top:12px';
            open.addEventListener('click', function () { window.GEData.ctx.courseId = c.id; window.GEData.open('course-detail', 'courses'); });
            card.appendChild(open);
        }
        return card;
    }

    pages.courses = async function (root, session) {
        const grid = root.querySelector('#pgFilterTarget');
        const chips = root.querySelector('.pg-chips');
        const head = root.querySelector('.pg-head p');
        if (head) head.textContent = 'Mavjud kurslar va siz yozilganlari';
        const create = [...root.querySelectorAll('.pg-head .pg-btn')].find(function (b) { return /Yangi kurs/.test(b.textContent); });
        if (create) create.remove();
        chips.removeAttribute('data-filter-group');
        chips.setAttribute('data-managed', ''); // real mode filters here, not in the demo handler
        grid.textContent = 'Yuklanmoqda...';

        const data = await get('/student/courses', session);
        let courses = data.courses;
        let filter = 'all';

        function drawChips() {
            chips.textContent = '';
            const cats = [...new Set(courses.map(function (c) { return c.category; }).filter(Boolean))];
            [['all', 'Hammasi'], ['mine', 'Mening kurslarim']].concat(cats.map(function (c) { return [c.toLowerCase(), c]; })).forEach(function (p) {
                const b = el('button', 'pg-chip' + (filter === p[0] ? ' on' : ''), p[1]); b.type = 'button'; b.dataset.cat = p[0];
                b.addEventListener('click', function () { filter = p[0]; drawChips(); drawGrid(); });
                chips.appendChild(b);
            });
        }
        async function enroll(c, btn) {
            btn.disabled = true;
            try {
                await send('POST', '/student/courses/' + c.id + '/enroll', session);
                c.enrolled = true; c.students += 1; c.progress = 0;
                drawGrid();
            } catch (e) {
                if (e.auth) { location.href = '../login/login.html'; return; }
                btn.disabled = false;
                btn.textContent = e.message === 'Already enrolled in this course' ? 'Allaqachon yozilgansiz' : 'Xatolik, qayta urining';
            }
        }
        function drawGrid() {
            grid.textContent = '';
            const shown = courses.filter(function (c) { return filter === 'all' || (filter === 'mine' ? c.enrolled : (c.category || '').toLowerCase() === filter); });
            if (!shown.length) {
                grid.appendChild(el('p', 'pg-muted', courses.length ? 'Bu bo\'limda kurs yo\'q.' : 'Hozircha kurslar yo\'q. O\'qituvchilar kurs qo\'shganda shu yerda ko\'rinadi.'));
                return;
            }
            shown.forEach(function (c) { grid.appendChild(courseCard(c, enroll)); });
        }
        drawChips();
        drawGrid();
    };

    // ---- Course detail (student): real videos and guides ----
    function youtubeId(url) {
        try {
            const u = new URL(url);
            const h = u.hostname.replace(/^www\./, '');
            let id = null;
            if (h === 'youtu.be') id = u.pathname.slice(1);
            else if (h === 'youtube.com' || h === 'm.youtube.com') {
                if (u.pathname === '/watch') id = u.searchParams.get('v');
                else { const m = u.pathname.match(/^\/(embed|shorts)\/([^/]+)/); if (m) id = m[2]; }
            }
            return id && /^[\w-]{6,20}$/.test(id) ? id : null;
        } catch (e) { return null; }
    }

    pages['course-detail'] = async function (root, session) {
        const pg = root.querySelector('.pg') || root;
        const id = window.GEData.ctx.courseId;
        pg.textContent = '';
        const back = el('button', 'pg-back'); back.type = 'button';
        back.appendChild(el('i', 'fas fa-arrow-left')); back.appendChild(document.createTextNode(' Barcha kurslar'));
        back.addEventListener('click', function () { window.GEData.open('courses', 'courses'); });
        pg.appendChild(back);
        if (!id) { pg.appendChild(el('p', 'pg-muted', 'Kursni "Kurslar" sahifasidan tanlang.')); return; }

        let data;
        try { data = await get('/student/courses/' + id + '/content', session); }
        catch (e) {
            if (e.auth) throw e;
            pg.appendChild(el('p', 'pg-muted', 'Bu kursga yozilmagansiz yoki kurs topilmadi.'));
            return;
        }
        const c = data.course; const items = data.items || [];
        const hero = el('section', 'pg-card'); hero.style.marginTop = '14px';
        if (c.category) hero.appendChild(el('span', 'pg-pill sun', c.category));
        const h = el('h1', '', c.title); h.style.marginTop = '8px'; hero.appendChild(h);
        if (c.description) hero.appendChild(el('p', 'pg-muted', c.description));
        hero.appendChild(el('div', 'pg-muted', c.teacher || 'O\'qituvchi belgilanmagan'));
        pg.appendChild(hero);

        const player = el('div', 'pg-card'); player.style.marginTop = '14px'; player.hidden = true;
        const pTitle = el('h3'); const frame = el('div'); frame.style.cssText = 'position:relative;padding-top:56.25%;margin-top:10px';
        player.appendChild(pTitle); player.appendChild(frame); pg.appendChild(player);

        function play(it) {
            const yt = youtubeId(it.url);
            if (!yt) { window.open(it.url, '_blank', 'noopener,noreferrer'); return; }
            player.hidden = false; pTitle.textContent = it.title; frame.textContent = '';
            const f = document.createElement('iframe');
            f.src = 'https://www.youtube-nocookie.com/embed/' + yt;
            f.title = it.title; f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin';
            f.setAttribute('allow', 'encrypted-media; picture-in-picture; fullscreen');
            f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:10px';
            frame.appendChild(f);
            player.scrollIntoView && player.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        function list(kind, label, iconCls, action) {
            const box = el('div', 'pg-card'); box.style.marginTop = '14px';
            box.appendChild(el('h3', 'pg-h3', label));
            const mine = items.filter(function (x) { return x.kind === kind; });
            if (!mine.length) box.appendChild(el('p', 'pg-muted', 'Hozircha yo\'q. O\'qituvchi qo\'shganda shu yerda ko\'rinadi.'));
            mine.forEach(function (it, i) {
                const r = el('div', 'pg-lesson');
                r.appendChild(el('span', 'n', String(i + 1).padStart(2, '0')));
                r.appendChild(el('i', iconCls));
                const t = el('div'); t.style.flex = '1'; t.appendChild(el('b', '', it.title)); r.appendChild(t);
                const b = el('button', 'pg-btn ghost', action); b.type = 'button';
                b.addEventListener('click', function () { play(it); });
                r.appendChild(b); box.appendChild(r);
            });
            return box;
        }
        pg.appendChild(list('video', 'Video darslar', 'fas fa-circle-play', 'Ko\'rish'));
        pg.appendChild(list('guide', 'Qo\'llanmalar', 'fas fa-file-lines', 'Ochish'));
    };

    // ---- Groups: every course has one group (teacher leads, students join by enrolling) ----
    pages.groups = async function (root, session) {
        const pg = root.querySelector('.pg') || root;
        const teacher = session.role === 'teacher';
        pg.textContent = '';
        const hd = el('div', 'pg-head'); const hdd = el('div');
        hdd.appendChild(el('h1', '', 'Guruhlar'));
        hdd.appendChild(el('p', '', teacher ? 'Har bir kursingiz uchun guruh avtomatik ochiladi' : 'Yozilgan kurslaringiz guruhlari. Kursga yozilganingizda guruhga avtomatik qo\'shilasiz'));
        hd.appendChild(hdd); pg.appendChild(hd);
        const grid = el('div', 'pg-grid'); pg.appendChild(grid);

        const list = (await get('/groups', session)).groups;
        if (!list.length) {
            grid.appendChild(el('p', 'pg-muted', teacher ? 'Kurs yaratganingizda guruh shu yerda paydo bo\'ladi.' : 'Hali guruhingiz yo\'q. Kursga yozilsangiz, kurs guruhi shu yerda ko\'rinadi.'));
            return;
        }
        list.forEach(function (g) {
            const card = el('article', 'pg-card pg-item');
            const cover = el('div', 'pg-cover', initials(g.name)); cover.style.background = 'var(--c' + ((g.id % 6) + 1) + ')';
            card.appendChild(cover);
            card.appendChild(el('span', 'pg-pill ' + (g.role === 'leader' ? 'sun' : ''), g.role === 'leader' ? 'Murabbiy' : 'A\'zo'));
            const h = el('h3', '', g.name); h.style.marginTop = '10px'; card.appendChild(h);
            const meta = el('div', 'pg-meta'); meta.appendChild(el('span', '', g.members + ' a\'zo')); card.appendChild(meta);
            const chat = el('button', 'pg-btn', 'Muhokama'); chat.type = 'button';
            chat.style.cssText = 'width:100%;justify-content:center;margin-top:12px';
            chat.addEventListener('click', function () { window.GEData.ctx.groupId = g.id; window.GEData.open('group-detail', 'groups'); });
            card.appendChild(chat);
            if (g.courseId) {
                const b = el('button', 'pg-btn ghost', teacher ? 'Kursni boshqarish' : 'Kursga o\'tish'); b.type = 'button';
                b.style.cssText = 'width:100%;justify-content:center;margin-top:8px';
                b.addEventListener('click', function () {
                    window.GEData.ctx.courseId = g.courseId;
                    if (teacher) window.GEData.open('t-course-edit', 't-courses'); else window.GEData.open('course-detail', 'courses');
                });
                card.appendChild(b);
            }
            grid.appendChild(card);
        });
    };

    // ---- Group discussion (both roles) ----
    pages['group-detail'] = async function (root, session) {
        const pg = root.querySelector('.pg') || root;
        const gid = window.GEData.ctx.groupId;
        pg.textContent = '';
        const back = el('button', 'pg-back'); back.type = 'button';
        back.appendChild(el('i', 'fas fa-arrow-left')); back.appendChild(document.createTextNode(' Barcha guruhlar'));
        back.addEventListener('click', function () { window.GEData.open('groups', 'groups'); });
        pg.appendChild(back);
        if (!gid) { pg.appendChild(el('p', 'pg-muted', 'Guruhni "Guruhlar" sahifasidan tanlang.')); return; }

        let info;
        try { info = await get('/groups/' + gid, session); }
        catch (e) { if (e.auth) throw e; pg.appendChild(el('p', 'pg-muted', 'Bu guruhga a\'zo emassiz yoki guruh topilmadi.')); return; }
        const leader = info.role === 'leader';

        const hero = el('section', 'pg-card'); hero.style.marginTop = '14px';
        hero.appendChild(el('h1', '', info.group.name));
        hero.appendChild(el('p', 'pg-muted', info.members.length + ' a\'zo'));
        pg.appendChild(hero);

        const wrap = el('div', 'pg-detail'); pg.appendChild(wrap);
        const main = el('div'); main.style.cssText = 'display:grid;gap:16px;align-content:start'; wrap.appendChild(main);

        const form = el('form', 'pg-card'); form.noValidate = true;
        const text = el('textarea', 'pg-input'); text.rows = 3; text.maxLength = 2000; text.placeholder = 'Savol yoki fikringizni yozing...'; text.setAttribute('aria-label', 'Xabar');
        form.appendChild(text);
        let topic = null;
        if (leader) {
            const lab = el('label', 'pg-muted'); lab.style.cssText = 'display:block;margin-top:8px';
            topic = document.createElement('input'); topic.type = 'checkbox';
            lab.appendChild(topic); lab.appendChild(document.createTextNode(' Mavzu sifatida e\'lon qilish'));
            form.appendChild(lab);
        }
        const msg = el('p', 'pg-muted'); msg.setAttribute('role', 'alert'); msg.style.minHeight = '1.2em';
        const send_ = el('button', 'pg-btn', 'Yuborish'); send_.type = 'submit'; send_.style.marginTop = '8px';
        form.appendChild(send_); form.appendChild(msg);
        main.appendChild(form);

        const feed = el('div'); feed.style.cssText = 'display:grid;gap:12px'; main.appendChild(feed);
        const moreBox = el('div'); main.appendChild(moreBox);
        let oldest = null;

        function postCard(p) {
            const c = el('div', 'pg-card'); c.dataset.postId = p.id;
            if (p.kind === 'topic') c.appendChild(el('span', 'pg-pill sky', 'Mavzu'));
            const who = el('div', 'pg-file'); who.style.marginTop = p.kind === 'topic' ? '10px' : '0';
            const av = el('span', 'pg-av', initials(p.full_name)); av.style.background = 'var(--c' + ((p.user_id % 6) + 1) + ')'; who.appendChild(av);
            const d = el('div'); d.style.flex = '1';
            d.appendChild(el('b', '', p.full_name));
            d.appendChild(el('div', 'pg-muted', ago(p.created_at))); who.appendChild(d);
            if (p.user_id === session.id || leader) {
                const x = el('button', 'pg-btn ghost'); x.type = 'button'; x.setAttribute('aria-label', 'O\'chirish');
                x.appendChild(el('i', 'fas fa-trash'));
                x.addEventListener('click', async function () {
                    x.disabled = true;
                    try { await send('DELETE', '/groups/' + gid + '/posts/' + p.id, session); c.remove(); }
                    catch (e) { if (e.auth) { location.href = '../login/login.html'; return; } x.disabled = false; msg.textContent = e.message; }
                });
                who.appendChild(x);
            }
            c.appendChild(who);
            const body = el('p', '', p.body); body.style.cssText = 'margin:10px 0 0;white-space:pre-wrap;overflow-wrap:anywhere'; c.appendChild(body);
            return c;
        }
        function showPosts(list, append) {
            if (!append) feed.textContent = '';
            list.forEach(function (p) { feed.appendChild(postCard(p)); });
            if (list.length) oldest = list[list.length - 1].id;
            if (!feed.children.length) feed.appendChild(el('p', 'pg-muted', 'Hali xabar yo\'q. Birinchi bo\'lib yozing.'));
        }
        function drawMore(more) {
            moreBox.textContent = '';
            if (!more) return;
            const b = el('button', 'pg-btn ghost', 'Eskilarini ko\'rsatish'); b.type = 'button';
            b.addEventListener('click', async function () {
                b.disabled = true;
                try {
                    const r = await get('/groups/' + gid + '/posts?before=' + oldest, session);
                    showPosts(r.posts, true); drawMore(r.more);
                } catch (e) { if (e.auth) { location.href = '../login/login.html'; return; } b.disabled = false; msg.textContent = e.message; }
            });
            moreBox.appendChild(b);
        }
        async function load() {
            const r = await get('/groups/' + gid + '/posts', session);
            showPosts(r.posts, false); drawMore(r.more);
        }
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault(); msg.textContent = '';
            if (!text.value.trim()) { msg.textContent = 'Xabar matnini yozing.'; return; }
            send_.disabled = true;
            try {
                await send('POST', '/groups/' + gid + '/posts', session, { body: text.value, kind: topic && topic.checked ? 'topic' : 'message' });
                text.value = ''; if (topic) topic.checked = false;
                await load();
            } catch (e) { if (e.auth) { location.href = '../login/login.html'; return; } msg.textContent = e.message; }
            send_.disabled = false;
        });

        const side = el('aside'); side.style.cssText = 'display:grid;gap:18px;align-content:start'; wrap.appendChild(side);
        const people = el('div', 'pg-card'); people.appendChild(el('h3', 'pg-h3', 'A\'zolar'));
        info.members.forEach(function (m) {
            const r = el('div', 'pg-file'); r.style.padding = '9px 0';
            const av = el('span', 'pg-av', initials(m.full_name)); av.style.cssText = 'width:36px;height:36px;font-size:12px;background:var(--c' + ((m.id % 6) + 1) + ')';
            r.appendChild(av);
            const n = el('b', '', m.full_name); n.style.flex = '1'; r.appendChild(n);
            if (m.role === 'leader') r.appendChild(el('span', 'pg-pill sun', 'O\'qituvchi'));
            people.appendChild(r);
        });
        side.appendChild(people);
        await load();
    };

    // ---- Tasks (student): course tasks + tasks assigned to me; submit, see grade and feedback ----
    function todayIso() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    const TASK_FILTERS = [['all', 'Hammasi'], ['todo', 'Topshirilmagan'], ['submitted', 'Topshirilgan'], ['graded', 'Baholangan']];

    pages.vazifalar = async function (root, session) {
        root.textContent = '';
        const pg = el('div', 'pg'); root.appendChild(pg);
        const hd = el('div', 'pg-head'); const hdd = el('div');
        hdd.appendChild(el('h1', '', 'Vazifalar'));
        hdd.appendChild(el('p', '', 'Yozilgan kurslaringiz vazifalari. Javobni topshiring va bahoni shu yerda ko\'ring'));
        hd.appendChild(hdd); pg.appendChild(hd);
        const chips = el('div', 'pg-chips'); chips.setAttribute('data-managed', ''); pg.appendChild(chips);
        const list = el('div'); list.style.cssText = 'display:grid;gap:14px'; pg.appendChild(list);
        list.textContent = 'Yuklanmoqda...';

        const tasks = (await get('/student/tasks', session)).tasks;
        let filter = 'all';
        let openId = null;

        function drawChips() {
            chips.textContent = '';
            TASK_FILTERS.forEach(function (f) {
                const n = f[0] === 'all' ? tasks.length : tasks.filter(function (t) { return t.status === f[0]; }).length;
                const b = el('button', 'pg-chip' + (filter === f[0] ? ' on' : ''), f[1] + ' (' + n + ')');
                b.type = 'button'; b.dataset.cat = f[0];
                b.addEventListener('click', function () { filter = f[0]; draw(); });
                chips.appendChild(b);
            });
        }
        function card(t) {
            const c = el('article', 'pg-card');
            const top = el('div'); top.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
            top.appendChild(el('span', 'pg-pill sky', t.course));
            const label = { todo: 'Topshirilmagan', submitted: 'Topshirilgan', graded: 'Baholangan' }[t.status];
            top.appendChild(el('span', 'pg-pill' + (t.status === 'todo' ? ' sun' : ''), label));
            if (t.status === 'todo' && t.dueDate && t.dueDate < todayIso()) top.appendChild(el('span', 'pg-pill sun', 'Muddati o\'tgan'));
            c.appendChild(top);
            const h = el('h3', '', t.title); h.style.marginTop = '10px'; c.appendChild(h);
            if (t.dueDate) c.appendChild(el('div', 'pg-muted', 'Muddat: ' + t.dueDate));
            if (t.description) { const d = el('p', '', t.description); d.style.cssText = 'margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere'; c.appendChild(d); }
            if (t.status === 'graded') {
                const g = el('div', 'pg-row'); g.style.marginTop = '12px';
                g.appendChild(el('b', '', 'Baho: ' + t.grade + '/100'));
                c.appendChild(g);
                if (t.feedback) { const f = el('p', 'pg-muted', 'O\'qituvchi izohi: ' + t.feedback); f.style.cssText = 'margin:6px 0 0;white-space:pre-wrap'; c.appendChild(f); }
            } else {
                const toggle = el('button', 'pg-btn' + (t.status === 'todo' ? ' sun' : ' ghost'), t.status === 'todo' ? 'Topshirish' : 'Javobni o\'zgartirish');
                toggle.type = 'button'; toggle.style.marginTop = '12px';
                toggle.addEventListener('click', function () { openId = openId === t.id ? null : t.id; draw(); });
                c.appendChild(toggle);
                if (openId === t.id) {
                    const form = el('form'); form.noValidate = true; form.style.marginTop = '10px';
                    const ta = el('textarea', 'pg-input'); ta.rows = 5; ta.maxLength = 10000; ta.value = t.content || '';
                    ta.placeholder = 'Javobingizni yoki ishingizga havolani yozing...'; ta.setAttribute('aria-label', 'Javob');
                    const msg = el('p', 'pg-muted'); msg.setAttribute('role', 'alert'); msg.style.minHeight = '1.2em';
                    const go = el('button', 'pg-btn', 'Yuborish'); go.type = 'submit'; go.style.marginTop = '8px';
                    form.appendChild(ta); form.appendChild(go); form.appendChild(msg);
                    form.addEventListener('submit', async function (ev) {
                        ev.preventDefault(); msg.textContent = '';
                        if (!ta.value.trim()) { msg.textContent = 'Javob matnini yozing.'; return; }
                        go.disabled = true;
                        try {
                            await send('POST', '/student/tasks/' + t.id + '/submit', session, { content: ta.value });
                            t.status = 'submitted'; t.content = ta.value.trim(); openId = null; draw();
                        } catch (e) {
                            if (e.auth) { location.href = '../login/login.html'; return; }
                            go.disabled = false;
                            msg.textContent = /graded/.test(e.message) ? 'Bu ish allaqachon baholangan, o\'zgartirib bo\'lmaydi.' : e.message;
                        }
                    });
                    c.appendChild(form);
                }
            }
            return c;
        }
        function draw() {
            drawChips();
            list.textContent = '';
            const shown = tasks.filter(function (t) { return filter === 'all' || t.status === filter; });
            if (!shown.length) {
                list.appendChild(el('p', 'pg-muted', tasks.length ? 'Bu bo\'limda vazifa yo\'q.' : 'Hozircha vazifa yo\'q. Kursga yozilsangiz, o\'qituvchi bergan vazifalar shu yerda ko\'rinadi.'));
                return;
            }
            shown.forEach(function (t) { list.appendChild(card(t)); });
        }
        draw();
    };

    // Returns a promise (resolved when done). Auth errors are passed to onAuthError, other errors to onError.
    window.GEData = {
        hydrate: function (page, root, session, onAuthError, onError) {
            const fn = pages[page];
            if (!fn || !session || !session.id) return Promise.resolve();
            return fn(root, session).catch(function (err) {
                if (err && err.auth) onAuthError(); else onError(err);
            });
        },
        register: function (name, fn) { pages[name] = fn; },
        has: function (name) { return Boolean(pages[name]); },
        // Grey placeholder page shown while a page loads (no text from outside, markup built with the DOM)
        skeleton: function () {
            const bar = function (w, h) { const b = el('div', 'sk'); b.style.width = w; b.style.height = h + 'px'; return b; };
            const circle = function (d) { const c = bar(d + 'px', d); c.classList.add('sk-circle'); return c; };
            const root = el('div', 'sk-page');
            root.setAttribute('role', 'status'); root.setAttribute('aria-busy', 'true');
            root.appendChild(el('span', 'sk-sr', 'Yuklanmoqda...'));
            const head = el('div'); head.style.cssText = 'display:grid;gap:10px';
            head.appendChild(bar('min(280px,60%)', 28)); head.appendChild(bar('min(440px,85%)', 14)); root.appendChild(head);
            const cards = el('div', 'sk-cards');
            for (let i = 0; i < 4; i++) {
                const c = el('div', 'sk-card'); c.appendChild(circle(46));
                const t = el('div', 'sk-stack'); t.appendChild(bar('55%', 20)); t.appendChild(bar('80%', 12)); c.appendChild(t); cards.appendChild(c);
            }
            root.appendChild(cards);
            const cols = el('div', 'sk-cols');
            for (let k = 0; k < 2; k++) {
                const panel = el('div', 'sk-panel'); panel.appendChild(bar('40%', 18));
                for (let i = 0; i < 4; i++) {
                    const r = el('div', 'sk-row'); r.appendChild(circle(36));
                    const t = el('div', 'sk-stack'); t.appendChild(bar('70%', 14)); t.appendChild(bar('45%', 11)); r.appendChild(t); panel.appendChild(r);
                }
                cols.appendChild(panel);
            }
            root.appendChild(cols);
            return root;
        },
        // Menu badges and the header bell show real counts, or nothing
        badges: async function (session) {
            document.querySelectorAll('.nav-badge, .notification-badge').forEach(function (b) { b.hidden = true; });
            const c = await get('/summary/counts', session);
            const set = function (page, n) {
                const item = document.querySelector('.nav-item[onclick*="\'' + page + '\'"] .nav-badge');
                if (!item) return;
                item.textContent = String(n); item.hidden = !(n > 0);
            };
            if (c.role === 'student') { set('groups', c.groups); set('vazifalar', c.tasksTodo); set('orders', c.ordersAnswered); }
            if (c.role === 'teacher') { set('t-grading', c.toGrade); set('t-orders', c.ordersPending); set('groups', c.groups); }
        },
        api: { get: get, send: send },
        el: el,
        ctx: {}, // values handed from one page to the next, e.g. the course being edited
        toast: function (text) {
            const t = el('div', 'pg-toast', text);
            document.body.appendChild(t);
            setTimeout(function () { t.remove(); }, 3500);
        },
        open: function (page, navPage) {
            const nav = navPage && document.querySelector('.nav-item[onclick*="\'' + navPage + '\'"]');
            window.loadPage(page, nav || document.querySelector('.nav-item.active'));
        },
        _ago: ago, _activityText: activityText
    };
})();
