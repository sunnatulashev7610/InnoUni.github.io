/* Star ratings of a course (real session only): the summary for everybody, a form for enrolled students.
   Needs dashboard-data.js. All text goes in through textContent. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get; const send = G.api.send;

    const reviews = {};
    G.reviews = reviews;

    // "★ 4.5 (12)" or "Hali baho yo'q"
    reviews.label = function (rating, count) {
        return count ? '★ ' + Number(rating).toFixed(1) + ' (' + count + ')' : 'Hali baho yo\'q';
    };
    const stars = function (n) { return '★'.repeat(n) + '☆'.repeat(5 - n); };
    const day = function (s) { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('uz-UZ'); };

    reviews.card = function (courseId, session) {
        const card = el('section', 'pg-card'); card.style.marginTop = '14px';
        card.appendChild(el('h3', 'pg-h3', 'Kurs bahosi'));
        const body = el('div'); card.appendChild(body);
        body.appendChild(el('p', 'pg-muted', 'Yuklanmoqda...'));
        let state = null;

        function summaryBox(s) {
            const box = el('div'); box.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px 28px;align-items:center;margin-bottom:12px';
            const big = el('div');
            const avg = el('div', '', s.count ? String(s.average.toFixed(1)) : '–'); avg.style.cssText = 'font-size:2.2rem;font-weight:800;line-height:1';
            big.appendChild(avg);
            big.appendChild(el('div', 'pg-muted', s.count ? s.count + ' ta baho' : 'Hali baho yo\'q'));
            box.appendChild(big);
            const bars = el('div'); bars.style.cssText = 'flex:1;min-width:180px;display:grid;gap:4px';
            [5, 4, 3, 2, 1].forEach(function (n) {
                const row = el('div'); row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:.85rem';
                const lab = el('span', 'pg-muted', n + '★'); lab.style.width = '26px';
                const track = el('div', 'pg-bar'); track.style.flex = '1';
                const fill = document.createElement('i'); fill.style.width = (s.count ? Math.round((s.distribution[n] || 0) * 100 / s.count) : 0) + '%'; fill.style.background = 'var(--brand)';
                track.appendChild(fill);
                const cnt = el('span', 'pg-muted', String(s.distribution[n] || 0)); cnt.style.cssText = 'width:26px;text-align:right';
                [lab, track, cnt].forEach(function (x) { row.appendChild(x); });
                bars.appendChild(row);
            });
            box.appendChild(bars);
            return box;
        }

        function form(d) {
            const f = el('form'); f.noValidate = true; f.style.cssText = 'display:grid;gap:8px;margin:0 0 14px;padding:12px 14px;border:1px solid var(--line);border-radius:12px';
            f.appendChild(el('b', '', d.mine ? 'Sizning bahoyingiz' : 'Kursni baholang'));
            let value = d.mine ? d.mine.rating : 0;
            const row = el('div'); row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-label', 'Baho'); row.style.cssText = 'display:flex;gap:4px';
            const btns = [1, 2, 3, 4, 5].map(function (n) {
                const b = el('button', 'pg-btn ghost', '★'); b.type = 'button'; b.style.cssText = 'padding:2px 10px;font-size:1.3rem;line-height:1.2';
                b.setAttribute('role', 'radio'); b.setAttribute('aria-label', n + ' yulduz');
                b.addEventListener('click', function () { value = n; paint(); });
                row.appendChild(b); return b;
            });
            function paint() {
                btns.forEach(function (b, i) { const on = i < value; b.setAttribute('aria-checked', i + 1 === value ? 'true' : 'false'); b.style.color = on ? 'var(--brand-ink)' : 'var(--ink-3)'; b.textContent = on ? '★' : '☆'; });
            }
            paint(); f.appendChild(row);
            const ta = el('textarea', 'pg-input'); ta.rows = 3; ta.maxLength = d.limits.maxComment; ta.value = d.mine && d.mine.comment ? d.mine.comment : ''; ta.placeholder = 'Fikringiz (ixtiyoriy)'; ta.setAttribute('aria-label', 'Fikr');
            f.appendChild(ta);
            const acts = el('div'); acts.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center';
            const save = el('button', 'pg-btn', d.mine ? 'Yangilash' : 'Yuborish'); save.type = 'submit'; save.style.padding = '6px 14px';
            const msg = el('span', 'pg-muted'); msg.setAttribute('role', 'status');
            acts.appendChild(save);
            if (d.mine) {
                const del = el('button', 'pg-btn ghost', 'Bahoni o\'chirish'); del.type = 'button'; del.style.padding = '6px 14px';
                G.twice(del, 'Aniqmi?', async function () {
                    try { await send('DELETE', '/course-reviews/courses/' + courseId, session); await load(); }
                    catch (e) { if (e.auth) throw e; msg.textContent = 'O\'chirib bo\'lmadi.'; }
                });
                acts.appendChild(del);
            }
            acts.appendChild(msg); f.appendChild(acts);
            f.addEventListener('submit', async function (e) {
                e.preventDefault(); msg.textContent = '';
                if (!value) { msg.textContent = 'Avval yulduz tanlang.'; return; }
                save.disabled = true;
                try { await send('PUT', '/course-reviews/courses/' + courseId, session, { rating: value, comment: ta.value }); G.toast('Bahoyingiz saqlandi'); await load(); }
                catch (er) { if (er.auth) throw er; if (er.status !== 403 || !er.data || er.data.code !== 'EMAIL_NOT_VERIFIED') msg.textContent = 'Saqlab bo\'lmadi. Qayta urinib ko\'ring.'; save.disabled = false; }
            });
            return f;
        }

        function draw() {
            body.textContent = '';
            const d = state;
            body.appendChild(summaryBox(d.summary));
            if (d.can_review) body.appendChild(form(d));
            const list = d.reviews.filter(function (r) { return r.comment || !r.mine; });
            list.forEach(function (r) {
                const row = el('div', 'pg-row'); row.style.alignItems = 'flex-start';
                const left = el('div'); left.style.cssText = 'flex:1;min-width:0';
                const top = el('div'); top.appendChild(el('b', '', r.author + (r.mine ? ' (siz)' : '')));
                const st = el('span', '', ' ' + stars(r.rating)); st.style.color = 'var(--brand-ink)'; st.setAttribute('aria-label', r.rating + ' yulduz'); top.appendChild(st);
                left.appendChild(top);
                if (r.comment) { const p = el('div', 'pg-muted', r.comment); p.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere'; left.appendChild(p); }
                row.appendChild(left); row.appendChild(el('span', 'pg-muted', day(r.created_at)));
                body.appendChild(row);
            });
            if (!list.length && !d.can_review) body.appendChild(el('p', 'pg-muted', 'Hali fikr yozilmagan.'));
        }

        async function load() {
            try { state = await get('/course-reviews/courses/' + courseId, session); draw(); }
            catch (e) { if (e.auth) throw e; body.textContent = ''; body.appendChild(el('p', 'pg-muted', 'Baholarni yuklab bo\'lmadi.')); }
        }
        load();
        return card;
    };
})();
