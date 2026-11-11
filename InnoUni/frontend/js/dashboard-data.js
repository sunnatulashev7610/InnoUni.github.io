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
