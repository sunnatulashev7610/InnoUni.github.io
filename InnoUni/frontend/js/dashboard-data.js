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

            const [stats, activity] = await Promise.all([
                get('/dashboard/stats/' + session.id, session),
                get('/dashboard/activity/' + session.id + '?limit=6', session)
            ]);
            const v = [stats.courses.active, stats.tasks.due_this_week, stats.groups.active, stats.learning.current_streak];
            nums.forEach(function (n, i) { if (v[i] !== undefined) n.textContent = String(v[i]); });
            setFill(cards[0], Number(stats.courses.avg_progress) || 0);
            setFill(cards[1], stats.tasks.total ? 100 * (stats.tasks.total - stats.tasks.overdue) / stats.tasks.total : 100);
            setFill(cards[2], stats.groups.active ? 100 : 0);
            setFill(cards[3], 100 * stats.learning.current_streak / 28);
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

        let list;
        if (teacher) {
            const d = await get('/teacher/courses', session);
            list = d.courses.map(function (c) { return { id: c.id, courseId: c.id, name: c.title, members: c.students + 1, role: 'leader' }; });
        } else {
            const d = await get('/student/groups', session);
            list = d.groups;
        }
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
            if (g.courseId) {
                const b = el('button', 'pg-btn ghost', teacher ? 'A\'zolar va kurs' : 'Kursga o\'tish'); b.type = 'button';
                b.style.cssText = 'width:100%;justify-content:center;margin-top:12px';
                b.addEventListener('click', function () {
                    window.GEData.ctx.courseId = g.courseId;
                    if (teacher) window.GEData.open('t-course-edit', 't-courses'); else window.GEData.open('course-detail', 'courses');
                });
                card.appendChild(b);
            }
            grid.appendChild(card);
        });
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
