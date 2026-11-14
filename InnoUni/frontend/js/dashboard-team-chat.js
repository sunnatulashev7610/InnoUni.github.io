/* Team chat widget: G.teamChat(team, session) -> { node, ready, refresh, stop }.
   New messages arrive by polling (every few seconds while the chat is on screen and the tab is visible).
   The admin (who opened the team) can delete messages and restrict a writer for a while.
   Text goes in via textContent only, so nothing a user typed can become markup. Needs dashboard-data.js. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get; const send = G.api.send;

    const POLL_MS = 4000;
    const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
    const MUTES = [[10, '10 daq', '10 daqiqaga'], [60, '1 soat', '1 soatga'], [1440, '1 kun', '1 kunga']];

    const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
    const timeText = (v) => new Date(v).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    function dayText(v) {
        const d = new Date(v); const t = new Date();
        if (d.toDateString() === t.toDateString()) return 'Bugun';
        t.setDate(t.getDate() - 1);
        return d.toDateString() === t.toDateString() ? 'Kecha' : d.toLocaleDateString('uz-UZ');
    }
    function waitText(sec) {
        if (sec >= 86400) return Math.ceil(sec / 86400) + ' kun';
        if (sec >= 3600) return Math.ceil(sec / 3600) + ' soat';
        return Math.max(1, Math.ceil(sec / 60)) + ' daqiqa';
    }

    G.teamChat = function (team, session) {
        const base = '/teams/' + team.id + '/messages';
        const root = el('div', 'tc');
        const list = el('div', 'tc-list'); list.setAttribute('role', 'log'); list.setAttribute('aria-live', 'polite'); list.setAttribute('aria-label', 'Jamoa chati');
        const foot = el('div');
        root.appendChild(list); root.appendChild(foot);

        const st = { msgs: [], more: false, isAdmin: false, max: 5000, mutedUntil: 0, stopped: false, busy: false, sending: false, timer: null, closed: '' };
        let input = null; let sendBtn = null; let errBox = null; let countBox = null;

        const lastId = () => (st.msgs.length ? st.msgs[st.msgs.length - 1].id : 0);
        const firstId = () => (st.msgs.length ? st.msgs[0].id : 0);
        const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 90;
        const toBottom = () => { list.scrollTop = list.scrollHeight; };
        const isMuted = () => !st.isAdmin && st.mutedUntil > Date.now();

        // ---- one message
        function tools(m, bubble) {
            const box = el('div', 'tc-tools'); box.hidden = true;
            const del = el('button', 'pg-btn danger', "O'chirish"); del.type = 'button';
            G.twice(del, 'Aniqmi?', async function () {
                try {
                    await send('DELETE', base + '/' + m.id, session);
                    st.msgs = st.msgs.filter(function (x) { return x.id !== m.id; });
                    renderAll(true);
                } catch (e) { G.toast(failText(e)); }
            });
            box.appendChild(del);
            if (!m.mine && m.user_id) {
                box.appendChild(el('span', '', 'Yozishni cheklash:'));
                MUTES.forEach(function (x) {
                    const b = el('button', 'pg-btn ghost', x[1]); b.type = 'button';
                    b.addEventListener('click', async function () {
                        b.disabled = true;
                        try { await send('POST', '/teams/' + team.id + '/members/' + m.user_id + '/mute', session, { minutes: x[0] }); G.toast(m.name + ' ' + x[2] + ' cheklandi'); box.hidden = true; }
                        catch (e) { G.toast(failText(e)); }
                        b.disabled = false;
                    });
                    box.appendChild(b);
                });
            }
            bubble.appendChild(box);
            return box;
        }

        function row(m) {
            const r = el('div', 'tc-row' + (m.mine ? ' me' : '')); r.dataset.id = m.id;
            if (!m.mine) {
                const av = el('span', 'tc-av', m.name === 'Anonim' ? '?' : initials(m.name));
                av.style.background = COLORS[(m.user_id || 0) % COLORS.length]; r.appendChild(av);
            }
            const b = el('div', 'tc-bubble');
            if (!m.mine) {
                const n = el('div', 'tc-name'); n.appendChild(el('span', '', m.name || ''));
                if (m.is_admin) n.appendChild(el('span', 'pg-pill sun', 'Admin'));
                b.appendChild(n);
            }
            b.appendChild(el('div', 'tc-text', m.body));
            const meta = el('div', 'tc-meta'); meta.appendChild(el('span', '', timeText(m.created_at)));
            if (st.isAdmin) {
                const box = tools(m, b);
                const dots = el('button', 'tc-dots', '⋯'); dots.type = 'button'; dots.setAttribute('aria-label', 'Xabar amallari');
                dots.addEventListener('click', function () { box.hidden = !box.hidden; });
                meta.appendChild(dots);
            }
            b.insertBefore(meta, b.querySelector('.tc-tools'));
            r.appendChild(b);
            return r;
        }

        // ---- the list
        function renderAll(keepScroll) {
            const top = list.scrollTop; const stick = nearBottom();
            list.textContent = '';
            if (st.more) {
                const more = el('button', 'pg-btn ghost tc-more', 'Oldingi xabarlar'); more.type = 'button';
                more.addEventListener('click', async function () {
                    more.disabled = true;
                    const h0 = list.scrollHeight; const t0 = list.scrollTop;
                    try {
                        const r = await get(base + '?before=' + firstId(), session);
                        st.msgs = r.messages.concat(st.msgs); st.more = r.more; renderAll(true);
                        list.scrollTop = list.scrollHeight - h0 + t0;   // keep what the reader was looking at
                    } catch (e) { more.disabled = false; G.toast(failText(e)); }
                });
                list.appendChild(more);
            }
            if (!st.msgs.length) list.appendChild(el('div', 'tc-empty', "Hali xabar yo'q. Birinchi bo'lib yozing!"));
            let day = '';
            st.msgs.forEach(function (m) {
                const d = new Date(m.created_at).toDateString();
                if (d !== day) { day = d; list.appendChild(el('div', 'tc-day', dayText(m.created_at))); }
                list.appendChild(row(m));
            });
            if (keepScroll && !stick) list.scrollTop = top; else if (stick || !keepScroll) toBottom();
        }

        function appendNew(items) {
            const stick = nearBottom();
            const had = st.msgs.length;
            let day = had ? new Date(st.msgs[had - 1].created_at).toDateString() : '';
            const empty = list.querySelector('.tc-empty'); if (empty) empty.remove();
            let mine = false;
            items.forEach(function (m) {
                if (st.msgs.some(function (x) { return x.id === m.id; })) return;
                st.msgs.push(m); mine = mine || m.mine;
                const d = new Date(m.created_at).toDateString();
                if (d !== day) { day = d; list.appendChild(el('div', 'tc-day', dayText(m.created_at))); }
                list.appendChild(row(m));
            });
            if (stick || mine) toBottom();
        }

        // ---- the bottom: a text box, or the reason it is closed
        function renderFoot() {
            foot.textContent = ''; input = null; sendBtn = null; errBox = null; countBox = null;
            if (st.closed) { foot.appendChild(el('div', 'tc-note', st.closed)); return; }
            if (isMuted()) {
                const left = Math.ceil((st.mutedUntil - Date.now()) / 1000);
                foot.appendChild(el('div', 'tc-note', 'Siz yozishdan vaqtincha cheklandingiz. Qolgan vaqt: ' + waitText(left) + '. Xabarlarni o\'qishingiz mumkin.'));
                return;
            }
            countBox = el('div', 'tc-count'); countBox.hidden = true; foot.appendChild(countBox);
            errBox = el('div', 'tc-error'); errBox.setAttribute('role', 'alert'); errBox.hidden = true; foot.appendChild(errBox);
            const form = el('form', 'tc-compose'); form.noValidate = true;
            input = el('textarea', 'pg-input'); input.rows = 1; input.maxLength = st.max; input.placeholder = 'Xabar yozing...'; input.setAttribute('aria-label', 'Xabar');
            sendBtn = el('button', 'pg-btn', 'Yuborish'); sendBtn.type = 'submit';
            input.addEventListener('input', function () {
                input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px';
                const n = input.value.length; countBox.hidden = n < st.max * 0.9;
                countBox.textContent = n + ' / ' + st.max;
            });
            input.addEventListener('keydown', function (e) {
                // Enter sends, Shift+Enter is a new line; on touch screens Enter is always a new line
                const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !touch) { e.preventDefault(); submit(); }
            });
            form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
            form.appendChild(input); form.appendChild(sendBtn); foot.appendChild(form);
        }

        function failText(e) {
            if (e && e.auth) return 'Sessiya tugagan. Qayta kiring.';
            if (e && e.data && e.data.muted_seconds) return 'Siz ' + waitText(e.data.muted_seconds) + ' yozishdan cheklandingiz.';
            const m = String(e && e.message || '');
            if (/at most|too long/i.test(m)) return 'Xabar juda uzun (' + st.max + ' belgigacha).';
            if (/required/i.test(m)) return 'Xabar matnini yozing.';
            if (/Only team members/i.test(m)) return "Siz bu jamoaning a'zosi emassiz.";
            return "Bajarib bo'lmadi. Keyinroq urinib ko'ring.";
        }

        async function submit() {
            if (st.sending || !input) return;
            const text = input.value;
            if (!text.trim()) return;
            st.sending = true; sendBtn.disabled = true; errBox.hidden = true;
            try {
                const out = await send('POST', base, session, { body: text });
                input.value = ''; input.style.height = 'auto'; countBox.hidden = true;
                appendNew([Object.assign({}, out.message, { name: session.name })]);
                toBottom();
            } catch (e) {
                if (e.data && e.data.muted_seconds) { st.mutedUntil = Date.now() + e.data.muted_seconds * 1000; renderFoot(); return; }
                errBox.textContent = failText(e); errBox.hidden = false;
            } finally { st.sending = false; if (sendBtn) sendBtn.disabled = false; }
        }

        // The server is the clock: it tells how many seconds of restriction are left
        function applyMe(me) {
            if (!me) return;
            const was = isMuted();
            st.isAdmin = Boolean(me.is_admin);
            st.mutedUntil = me.muted && me.muted_seconds > 0 ? Date.now() + me.muted_seconds * 1000 : 0;
            if (was !== isMuted() || isMuted()) { const keep = input ? input.value : ''; renderFoot(); if (input && keep) input.value = keep; }
        }

        function close(text) { st.closed = text; st.stopped = true; clearInterval(st.timer); renderFoot(); }

        // ---- loading and polling
        async function load() {
            try {
                const r = await get(base, session);
                st.max = (r.limits && r.limits.maxMessageLength) || 5000;
                st.msgs = r.messages; st.more = r.more; st.isAdmin = Boolean(r.me && r.me.is_admin);
                st.mutedUntil = r.me && r.me.muted && r.me.muted_seconds > 0 ? Date.now() + r.me.muted_seconds * 1000 : 0;
                renderAll(false); renderFoot();
            } catch (e) {
                list.textContent = '';
                list.appendChild(el('div', 'tc-empty', e && e.auth ? "Chatni ochish uchun jamoa a'zosi bo'lishingiz kerak." : "Chatni yuklab bo'lmadi. Sahifani yangilang."));
                close(e && e.auth ? "Chatga faqat jamoa a'zolari yoza oladi." : 'Chat vaqtincha ishlamayapti.');
            }
        }

        async function refresh() {
            if (st.stopped || st.busy) return;
            st.busy = true;
            try {
                const r = await get(base + (lastId() ? '?after=' + lastId() + '&from=' + firstId() : ''), session);
                if (r.deleted && r.deleted.length) {
                    st.msgs = st.msgs.filter(function (m) { return r.deleted.indexOf(m.id) === -1; });
                    renderAll(true);
                }
                if (r.messages.length) {
                    if (lastId()) appendNew(r.messages); else { st.msgs = r.messages; renderAll(false); }
                }
                applyMe(r.me);
            } catch (e) {
                // Removed from the team while the chat was open
                if (e && e.auth) close("Siz endi bu jamoaning a'zosi emassiz.");
            } finally { st.busy = false; }
        }

        function stop() { st.stopped = true; clearInterval(st.timer); }

        st.timer = setInterval(function () {
            if (!root.isConnected) { stop(); return; }
            if (!document.hidden) refresh();
        }, POLL_MS);

        return { node: root, ready: load(), refresh: refresh, stop: stop };
    };
})();
