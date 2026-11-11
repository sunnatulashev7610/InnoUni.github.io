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

    async function send(method, path, session) {
        const res = await fetch(apiBase() + path, { method: method, headers: { Authorization: 'Bearer ' + session.token } });
        if (res.status === 401) { const err = new Error('auth'); err.auth = true; throw err; }
        const body = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(body.error || 'HTTP ' + res.status);
        return body;
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

    // Returns a promise (resolved when done). Auth errors are passed to onAuthError, other errors to onError.
    window.GEData = {
        hydrate: function (page, root, session, onAuthError, onError) {
            const fn = pages[page];
            if (!fn || !session || !session.id) return Promise.resolve();
            return fn(root, session).catch(function (err) {
                if (err && err.auth) onAuthError(); else onError(err);
            });
        },
        _ago: ago, _activityText: activityText
    };
})();
