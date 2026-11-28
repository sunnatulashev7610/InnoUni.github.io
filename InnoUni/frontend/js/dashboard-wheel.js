/* "Baraban": a live game for a team. The team admin opens a game, the SERVER draws the member and the question,
   the chosen member answers on their own phone. Everything a user wrote is set with textContent.
   Needs dashboard-data.js. Used by the Musobaqalar page (dashboard-teams.js). */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get; const send = G.api.send;
    const NS = 'http://www.w3.org/2000/svg';
    const GAME = { wheel: 'Baraban', quick: 'Tezkor viktorina', tf: "To'g'ri / noto'g'ri", pairs: 'Juftlash' };
    const SET_KIND = { wheel: 'quiz', quick: 'quiz', tf: 'tf', pairs: 'pairs' };
    const COLORS = ['#3b82f6', '#8b5cf6', '#0ea5a4', '#f59e0b', '#ef4444', '#10b981'];

    function say(err) {
        const m = String(err && err.message || '');
        if (err && err.auth) return 'Sessiya tugagan. Qayta kiring.';
        const map = [
            [/Someone is answering now/i, 'Hozir kimdir javob bermoqda.'],
            [/not your turn/i, 'Hozir sizning navbatingiz emas.'],
            [/already answered/i, 'Siz allaqachon javob bergansiz.'],
            [/already finished/i, "O'yin tugagan."],
            [/Only the team admin can start/i, "O'yinni faqat jamoa admini boshlaydi."],
            [/Only the person who started/i, "Buni faqat o'yinni boshlagan admin qila oladi."],
            [/At least \d+ active members/i, "Kamida 2 ta faol a'zo kerak."],
            [/fewer questions than members/i, "Bu to'plamda savollar a'zolardan kam."],
            [/already has a game in progress/i, "Jamoada o'yin allaqachon davom etmoqda."],
            [/Nobody is answering/i, 'Hozir hech kim javob bermayapti.'],
            [/Choose a team and a question set/i, "Jamoa va savollar to'plamini tanlang."],
            [/Choose one of the four options/i, 'Variantlardan birini tanlang.'],
            [/Only members of this team/i, "O'yinni faqat jamoa a'zolari ko'radi."],
            [/not found/i, 'Topilmadi.']
        ];
        for (let i = 0; i < map.length; i++) if (map[i][0].test(m)) return map[i][1];
        return "Xatolik bo'ldi. Qayta urinib ko'ring.";
    }
    function card(title) { const c = el('section', 'pg-card'); if (title) c.appendChild(el('h3', 'pg-h3', title)); return c; }
    function note() { const m = el('p', 'pg-muted'); m.setAttribute('role', 'alert'); m.style.cssText = 'min-height:1.2em;margin-top:10px'; return m; }
    function svg(tag, attrs) { const n = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }
    const spinMs = function () { return (window.GEWheel && window.GEWheel.spinMs) || 3500; };

    // The wheel: one sector per member still in the game, the pointer is at the top
    function makeWheel() {
        const root = svg('svg', { viewBox: '-160 -160 320 320', role: 'img', 'aria-label': 'Baraban' });
        root.style.cssText = 'width:min(100%,320px);height:auto;display:block;margin:0 auto';
        const g = svg('g'); g.style.transformOrigin = '0 0'; root.appendChild(g);
        root.appendChild(svg('polygon', { points: '-12,-168 12,-168 0,-136', fill: 'currentColor' }));
        let rotation = 0; let names = [];
        function draw(list) {
            names = list.slice(); g.textContent = ''; g.style.transition = 'none'; rotation = 0; g.style.transform = 'rotate(0deg)';
            const n = names.length; if (!n) return;
            const arc = 2 * Math.PI / n; const R = 140;
            names.forEach(function (m, i) {
                const a0 = i * arc; const a1 = a0 + arc; const fill = COLORS[i % COLORS.length];
                if (n === 1) g.appendChild(svg('circle', { r: R, fill: fill }));
                else g.appendChild(svg('path', { d: 'M0,0 L' + (R * Math.cos(a0)).toFixed(1) + ',' + (R * Math.sin(a0)).toFixed(1) + ' A' + R + ',' + R + ' 0 ' + (arc > Math.PI ? 1 : 0) + ' 1 ' + (R * Math.cos(a1)).toFixed(1) + ',' + (R * Math.sin(a1)).toFixed(1) + ' Z', fill: fill, stroke: '#fff', 'stroke-width': 2 }));
                const mid = a0 + arc / 2; const t = svg('text', { x: (R * 0.62 * Math.cos(mid)).toFixed(1), y: (R * 0.62 * Math.sin(mid)).toFixed(1), fill: '#fff', 'font-size': 13, 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'middle', transform: 'rotate(' + ((mid * 180 / Math.PI) + (Math.cos(mid) < -0.001 ? 180 : 0)).toFixed(1) + ' ' + (R * 0.62 * Math.cos(mid)).toFixed(1) + ' ' + (R * 0.62 * Math.sin(mid)).toFixed(1) + ')' });
                t.textContent = String(m).length > 12 ? String(m).slice(0, 11) + '…' : m; g.appendChild(t);
            });
        }
        // Lands the sector of `index` under the pointer; `animate` false puts it there at once
        function land(index, animate) {
            const n = names.length; if (!n || index < 0) return;
            const centre = (index + 0.5) * 360 / n;
            let delta = (((270 - centre - rotation) % 360) + 360) % 360;
            if (animate) delta += 360 * 5;
            rotation += delta;
            g.style.transition = animate ? 'transform ' + spinMs() + 'ms cubic-bezier(.15,.7,.2,1)' : 'none';
            g.style.transform = 'rotate(' + rotation + 'deg)';
        }
        return { node: root, draw: draw, land: land, names: function () { return names.slice(); } };
    }

    async function pane(session, teams) {
        const box = el('div'); box.dataset.wheel = 'pane'; box.style.cssText = 'display:grid;gap:18px';
        const adminTeams = (teams || []).filter(function (t) { return t.is_captain; });
        let timer = null; let tick = null;
        function stop() { clearInterval(timer); clearInterval(tick); timer = null; tick = null; }

        async function lobby() {
            stop(); box.textContent = '';
            let mine; let sets = null;
            try { mine = await get('/wheel/mine', session); } catch (e) { if (e.auth) throw e; box.appendChild(el('p', 'pg-muted', "Baraban o'yinlarini yuklab bo'lmadi.")); return; }
            const live = card("Jonli o'yinlar");
            if (!mine.open.length) live.appendChild(el('p', 'pg-muted', "Hozir ochiq o'yin yo'q. Jamoa admini o'yin boshlasa, shu yerda ko'rinadi."));
            mine.open.forEach(function (x) { live.appendChild(row(x, 'Kirish')); });
            box.appendChild(live);
            if (adminTeams.length) {
                try { sets = await get('/wheel/sets', session); } catch (e) { if (e.auth) throw e; }
                box.appendChild(startCard(sets));
            }
            if (mine.recent.length) { const r = card("Oxirgi o'yinlar"); mine.recent.forEach(function (x) { r.appendChild(row(x, 'Natija')); }); box.appendChild(r); }
        }
        function row(x, label) {
            const r = el('div'); r.dataset.session = String(x.id); r.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:6px 0';
            r.appendChild(el('span', '', x.team_name + ' · ' + x.title + ' (' + (GAME[x.mode] || GAME.wheel).toLowerCase() + ')'));
            const b = el('button', 'pg-btn', label); b.type = 'button'; b.style.padding = '7px 12px'; b.addEventListener('click', function () { session_(x.id); });
            r.appendChild(b); return r;
        }
        function startCard(sets) {
            const c = card("Yangi o'yin boshlash");
            if (!sets || !sets.sets.length) { c.appendChild(el('p', 'pg-muted', "Platforma admini hali savollar to'plamini qo'shmagan.")); return c; }
            c.appendChild(el('p', 'pg-muted', "Baraban: server tasodifiy a'zo va savolni tanlaydi, har kim bir marta javob beradi (" + sets.answer_seconds + " soniya). Tezkor viktorina, To'g'ri / noto'g'ri va Juftlash: a'zolar navbat bilan javob beradi, to'plamdagi hamma savol so'raladi. Kamida " + sets.min_players + " ta faol a'zo kerak."));
            const f = el('form'); f.noValidate = true; f.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
            const team = el('select', 'pg-input'); team.setAttribute('aria-label', 'Jamoa'); adminTeams.forEach(function (t) { const o = el('option', '', t.name); o.value = String(t.id); team.appendChild(o); });
            const set = el('select', 'pg-input'); set.setAttribute('aria-label', "Savollar to'plami");
            const kind = el('select', 'pg-input'); kind.setAttribute('aria-label', "O'yin turi");
            [['wheel', "Baraban (tasodifiy a'zo)"], ['quick', 'Tezkor viktorina (navbat bilan, ' + (sets.quick_seconds || 30) + ' soniya)'], ['tf', "To'g'ri / noto'g'ri (" + (sets.tf_seconds || 20) + ' soniya)'], ['pairs', 'Juftlash (atama va ta\'rif, ' + (sets.pairs_seconds || 30) + ' soniya)']].forEach(function (k) { const o = el('option', '', k[1]); o.value = k[0]; kind.appendChild(o); });
            // Only the sets that fit the chosen game type are offered
            function fillSets() {
                set.textContent = '';
                const fit = sets.sets.filter(function (x) { return (x.kind || 'quiz') === SET_KIND[kind.value]; });
                if (!fit.length) { const o = el('option', '', "Bu tur uchun to'plam yo'q"); o.value = ''; set.appendChild(o); go.disabled = true; return; }
                fit.forEach(function (x) { const o = el('option', '', x.title + ' · ' + x.count + (x.kind === 'pairs' ? ' ta juft' : ' ta savol')); o.value = String(x.id); set.appendChild(o); });
                go.disabled = false;
            }
            const go = el('button', 'pg-btn', 'Boshlash'); go.type = 'submit'; const m = note(); kind.addEventListener('change', fillSets);
            f.appendChild(kind); f.appendChild(team); f.appendChild(set); f.appendChild(go); c.appendChild(f); c.appendChild(m); fillSets();
            f.addEventListener('submit', async function (e) {
                e.preventDefault(); m.textContent = ''; if (!set.value) return; go.disabled = true;
                try { const r = await send('POST', '/wheel/sessions', session, { team_id: Number(team.value), set_id: Number(set.value), mode: kind.value }); session_(r.id); }
                catch (err) { m.textContent = say(err); go.disabled = false; }
            });
            return c;
        }

        // ---- one game
        function session_(id) {
            stop(); box.textContent = '';
            const back = el('button', 'pg-btn ghost', '← Orqaga'); back.type = 'button'; back.style.cssText = 'justify-self:start;padding:7px 12px'; back.addEventListener('click', lobby);
            const head = card(''); const title = el('h3', 'pg-h3', ''); const sub = el('p', 'pg-muted', ''); head.appendChild(title); head.appendChild(sub);
            const wheel = makeWheel(); const stage = card(''); stage.appendChild(wheel.node);
            const turn = el('div'); turn.dataset.turn = '1'; turn.style.cssText = 'margin-top:12px;display:grid;gap:10px'; stage.appendChild(turn);
            const ctl = el('div'); ctl.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; const msg = note(); stage.appendChild(ctl); stage.appendChild(msg);
            const lastC = card('Oxirgi javob'); lastC.dataset.last = '1'; lastC.hidden = true;
            const tableC = card('Natijalar'); const tbl = el('div'); tableC.appendChild(tbl);
            [back, head, stage, lastC, tableC].forEach(function (n) { box.appendChild(n); });

            let st = null; let seen = null; let first = true; let animating = false; let endsAt = 0; let sure = false;
            const cd = el('p', 'pg-muted'); cd.dataset.countdown = '1';

            async function act(path, body, then) {
                msg.textContent = '';
                try { const r = await send('POST', '/wheel/sessions/' + id + '/' + path, session, body); if (then) then(r); await load(); }
                catch (err) { msg.textContent = say(err); }
            }
            function button(text, cls, fn) { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }

            function apply() {
                if (!st) return;
                const quick = Boolean(st.mode) && st.mode !== 'wheel'; const gname = GAME[st.mode] || GAME.wheel;
                title.textContent = st.title;
                const asked = st.turns.length + (st.current ? 1 : 0);
                sub.textContent = (quick ? gname + ' · ' + (st.status === 'open' ? 'savollar ' + asked + ' / ' + st.total_questions : 'tugadi') : (st.status === 'open' ? "Baraban · jonli o'yin" : "Baraban · tugadi")) + " · to'g'ri javoblar: " + st.score + (st.status === 'open' ? '' : ' / ' + st.turns.length);
                wheel.node.style.display = quick ? 'none' : 'block';
                // The wheel shows who is still in; the chosen one is brought under the pointer
                const names = quick ? [] : st.remaining.map(function (m) { return m.name; });
                const same = JSON.stringify(names) === JSON.stringify(wheel.names());
                if (!same) wheel.draw(names);
                const idx = st.current && !quick ? st.remaining.findIndex(function (m) { return m.user_id === st.current.user_id; }) : -1;
                if (st.current && st.current.user_id !== seen) {
                    seen = st.current.user_id;
                    if (!first && idx >= 0) { wheel.land(idx, true); animating = true; setTimeout(function () { animating = false; apply(); }, spinMs()); } else if (idx >= 0) wheel.land(idx, false);
                } else if (!st.current) seen = null;
                first = false;
                turn.textContent = ''; ctl.textContent = '';
                if (st.status !== 'open') turn.appendChild(el('p', '', "O'yin tugadi. Natijalar pastda."));
                else if (animating) turn.appendChild(el('p', 'pg-muted', 'Baraban aylanmoqda…'));
                else if (st.current) {
                    turn.appendChild(el('p', '', st.my_turn ? 'Navbat sizda!' : 'Navbat: ' + st.current.name));
                    turn.appendChild(el('p', 'pg-h3', st.current.question.q));
                    endsAt = Date.now() + st.current.seconds_left * 1000; turn.appendChild(cd); cd.textContent = 'Qoldi: ' + st.current.seconds_left + ' soniya';
                    st.current.question.options.forEach(function (o, i) {
                        const b = el('button', 'pg-btn ghost', (st.mode === 'tf' ? '' : 'ABCD'.charAt(i) + ') ') + o); b.type = 'button'; b.dataset.choice = String(i); b.style.cssText = 'text-align:left;justify-content:flex-start';
                        if (!st.my_turn) b.disabled = true; else b.addEventListener('click', function () { act('answer', { choice: i }); });
                        turn.appendChild(b);
                    });
                } else turn.appendChild(el('p', 'pg-muted', quick ? (st.is_host ? "«Keyingi savol» ni bosing: navbatdagi a'zoga savol beriladi." : 'Admin keyingi savolni berishini kuting.') : (st.is_host ? "«Aylantirish» ni bosing: server a'zo va savolni tanlaydi." : 'Admin barabanni aylantirishini kuting.')));
                if (st.status === 'open' && st.is_host) {
                    if (!st.current) { const sp = button(quick ? 'Keyingi savol' : 'Aylantirish', 'pg-btn', function () { act('spin'); }); sp.dataset.act = 'spin'; ctl.appendChild(sp); }
                    else { const sk = button("O'tkazib yuborish", 'pg-btn ghost', function () { act('skip'); }); sk.dataset.act = 'skip'; ctl.appendChild(sk); }
                    const fin = button("O'yinni tugatish", 'pg-btn ghost', function () {
                        if (!sure) { sure = true; fin.textContent = 'Aniqmi? Qayta bosing'; setTimeout(function () { sure = false; fin.textContent = "O'yinni tugatish"; }, 4000); return; }
                        act('finish');
                    }); fin.dataset.act = 'finish'; ctl.appendChild(fin);
                }
                lastC.hidden = !st.last; 
                if (st.last) {
                    while (lastC.childNodes.length > 1) lastC.removeChild(lastC.lastChild);
                    lastC.appendChild(el('p', '', st.last.name + (st.last.timed_out ? ': vaqt tugadi' : st.last.correct ? ": to'g'ri javob" : ": noto'g'ri javob")));
                    lastC.appendChild(el('p', 'pg-muted', st.last.q));
                    lastC.appendChild(el('p', '', "To'g'ri javob: " + st.last.options[st.last.answer]));
                    if (st.last.explanation) lastC.appendChild(el('p', 'pg-muted', st.last.explanation));
                }
                tbl.textContent = '';
                if (quick) {
                    st.board.slice().sort(function (a, b) { return b.correct - a.correct || a.answered - b.answered; }).forEach(function (m) {
                        const r = el('div'); r.dataset.board = String(m.user_id); r.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0';
                        r.appendChild(el('span', '', m.name + (st.current && st.current.user_id === m.user_id ? ' (javob bermoqda)' : '')));
                        r.appendChild(el('b', '', m.correct + ' / ' + m.answered)); tbl.appendChild(r);
                    });
                    if (st.status !== 'open') stop();
                    return;
                }
                st.turns.forEach(function (t) { const r = el('div'); r.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0'; r.appendChild(el('span', '', t.name)); r.appendChild(el('b', '', t.correct ? "✓ to'g'ri" : "✗ xato")); tbl.appendChild(r); });
                st.remaining.forEach(function (m) { const r = el('div', 'pg-muted'); r.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0'; r.appendChild(el('span', '', m.name)); r.appendChild(el('span', '', st.current && st.current.user_id === m.user_id ? 'javob bermoqda' : 'kutmoqda')); tbl.appendChild(r); });
                if (st.status !== 'open') stop();
            }
            async function load() {
                let r;
                try { r = await get('/wheel/sessions/' + id, session); } catch (e) { if (e.auth) throw e; if (!box.isConnected) { stop(); return; } msg.textContent = say(e); return; }
                if (!box.isConnected) { stop(); return; }
                st = r; apply();
            }
            load();
            timer = setInterval(function () { if (!box.isConnected) { stop(); return; } load(); }, 2500);
            tick = setInterval(function () { if (!box.isConnected) { stop(); return; } if (st && st.current && !animating) cd.textContent = 'Qoldi: ' + Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) + ' soniya'; }, 1000);
        }

        await lobby();
        return box;
    }

    window.GEWheel = { pane: pane };
})();
