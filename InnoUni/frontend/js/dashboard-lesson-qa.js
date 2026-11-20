/* Questions under a lesson: students ask, the teacher answers. Needs dashboard-data.js. All text goes in via textContent. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get; const send = G.api.send;
    const when = function (v) { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('uz-UZ'); };

    // The Q&A box of one item. Loads itself; shows a short message when it cannot.
    G.lessonQa = function (itemId, session) {
        const box = el('div'); box.style.cssText = 'margin:8px 0 4px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;display:grid;gap:10px';
        const listEl = el('div'); listEl.style.cssText = 'display:grid;gap:10px';
        box.appendChild(listEl);
        let st = null;
        const msg = el('p', 'pg-muted'); msg.setAttribute('role', 'alert'); msg.style.minHeight = '1.2em';

        function item(q) {
            const r = el('div'); r.style.cssText = 'padding:10px 12px;border-radius:10px;border:1px solid var(--line);display:grid;gap:6px';
            const head = el('div', 'pg-muted', q.author + (q.created_at ? ' · ' + when(q.created_at) : '')); r.appendChild(head);
            const b = el('div', '', q.body); b.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-weight:600'; r.appendChild(b);
            if (q.answer) { const a = el('div', '', q.answer); a.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;padding:8px 10px;border-radius:8px;background:rgba(245,166,35,.12)'; r.appendChild(a); }
            else if (!st.can_answer) r.appendChild(el('span', 'pg-muted', 'Javob kutilmoqda'));
            const row = el('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
            if (st.can_answer) {
                const ta = el('textarea', 'pg-input'); ta.rows = 2; ta.maxLength = st.limits.maxAnswer; ta.value = q.answer || ''; ta.placeholder = 'Javobingiz'; ta.setAttribute('aria-label', 'Javob');
                const ok = el('button', 'pg-btn', q.answer ? 'Javobni yangilash' : 'Javob berish'); ok.type = 'button'; ok.style.padding = '6px 12px';
                ok.addEventListener('click', async function () {
                    ok.disabled = true; msg.textContent = '';
                    try { const x = await send('PUT', '/lesson-qa/questions/' + q.id + '/answer', session, { answer: ta.value }); q.answer = x.answer; draw(); }
                    catch (e) { if (e.auth) throw e; msg.textContent = 'Javobni saqlab bo\'lmadi.'; ok.disabled = false; }
                });
                r.appendChild(ta); row.appendChild(ok);
            }
            if (q.mine || st.can_answer) {
                const del = el('button', 'pg-btn ghost', 'O\'chirish'); del.type = 'button'; del.style.padding = '6px 12px';
                G.twice(del, 'Aniqmi?', async function () {
                    try { await send('DELETE', '/lesson-qa/questions/' + q.id, session); st.questions = st.questions.filter(function (x) { return x.id !== q.id; }); draw(); }
                    catch (e) { if (e.auth) throw e; msg.textContent = 'O\'chirib bo\'lmadi.'; }
                });
                row.appendChild(del);
            }
            if (row.childNodes.length) r.appendChild(row);
            return r;
        }
        function draw() {
            listEl.textContent = '';
            if (!st.questions.length) listEl.appendChild(el('p', 'pg-muted', st.can_answer ? 'Hali savol yo\'q.' : 'Hali savol yo\'q. Birinchi bo\'lib so\'rang.'));
            st.questions.forEach(function (q) { listEl.appendChild(item(q)); });
        }
        function form() {
            const f = el('form'); f.noValidate = true; f.style.cssText = 'display:grid;gap:8px';
            const ta = el('textarea', 'pg-input'); ta.rows = 2; ta.maxLength = st.limits.maxQuestion; ta.placeholder = 'Dars bo\'yicha savolingiz'; ta.setAttribute('aria-label', 'Savol');
            const go = el('button', 'pg-btn', 'Savol berish'); go.type = 'submit'; go.style.cssText = 'justify-self:start;padding:6px 12px';
            f.appendChild(ta); f.appendChild(go);
            f.addEventListener('submit', async function (e) {
                e.preventDefault(); msg.textContent = '';
                if (!ta.value.trim()) { msg.textContent = 'Savolni yozing.'; return; }
                go.disabled = true;
                try {
                    const q = await send('POST', '/lesson-qa/items/' + itemId, session, { body: ta.value });
                    q.author = 'Siz'; st.questions.unshift(q); ta.value = ''; draw();
                } catch (er) {
                    if (er.auth) throw er;
                    msg.textContent = er.status === 429 ? 'Javobsiz savollaringiz ko\'p. Avval javob kuting.' : 'Savolni yuborib bo\'lmadi.';
                }
                go.disabled = false;
            });
            return f;
        }
        listEl.appendChild(el('p', 'pg-muted', 'Yuklanmoqda...'));
        get('/lesson-qa/items/' + itemId, session).then(function (d) {
            st = d; draw();
            if (!d.can_answer) box.insertBefore(form(), listEl);
            box.appendChild(msg);
        }).catch(function (e) { if (e.auth) return; listEl.textContent = ''; listEl.appendChild(el('p', 'pg-muted', 'Savollarni yuklab bo\'lmadi.')); });
        return box;
    };

    // A toggle button that opens/closes the box right after `anchorAfter(box)`
    G.lessonQaToggle = function (itemId, session, place) {
        const tg = el('button', 'pg-btn ghost', 'Savol-javob'); tg.type = 'button'; tg.style.cssText = 'padding:6px 12px;margin:6px 6px 0 0';
        tg.setAttribute('aria-expanded', 'false');
        let panel = null;
        tg.addEventListener('click', function () {
            if (panel) { panel.remove(); panel = null; tg.setAttribute('aria-expanded', 'false'); return; }
            panel = G.lessonQa(itemId, session); place(panel); tg.setAttribute('aria-expanded', 'true');
        });
        return tg;
    };
})();
