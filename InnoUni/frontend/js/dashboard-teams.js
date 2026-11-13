/* Teams for signed-in students: list, open a team, join requests, team page.
   Real session only. In demo mode the sample pages stay as they are. Needs dashboard-data.js.
   Text goes in via textContent only, so nothing a user typed can become markup. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get; const send = G.api.send;

    const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
    const dateText = (v) => new Date(v).toLocaleDateString('uz-UZ');
    function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); }
    function page(root) { root.textContent = ''; const pg = el('div', 'pg'); root.appendChild(pg); return pg; }
    function head(title, sub) { const h = el('div', 'pg-head'); const d = el('div'); d.appendChild(el('h1', '', title)); d.appendChild(el('p', '', sub)); h.appendChild(d); return h; }
    function empty(text) { return el('p', 'pg-muted', text); }
    function card(title) { const c = el('section', 'pg-card'); if (title) c.appendChild(el('h3', 'pg-h3', title)); return c; }
    function cover(team, size) {
        const c = el('div', 'pg-cover', initials(team.name));
        c.style.background = COLORS[team.id % COLORS.length];
        if (size) { c.style.cssText += ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size / 2.6) + 'px;margin:0'; }
        return c;
    }
    function field(label, input, id) {
        const w = el('div'); const l = el('label', 'pg-lbl', label); l.htmlFor = id; input.id = id;
        w.appendChild(l); w.appendChild(input); return w;
    }
    // Goals are typed one per line
    const goalLines = (text) => String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);

    function problem(err) {
        const m = String(err && err.message || '');
        if (err && err.auth) return 'Sessiya tugagan. Qayta kiring.';
        if (/already taken/i.test(m)) return 'Bu nom band. Boshqa nom tanlang.';
        if (/at most \d+ teams/i.test(m)) return "Siz ko'pi bilan " + ((m.match(/\d+/) || ['5'])[0]) + ' ta jamoa ocha olasiz.';
        if (/not available/i.test(m)) return 'Jamoalar hozircha yopiq.';
        if (/Already requested/i.test(m)) return "So'rov allaqachon yuborilgan.";
        if (/Only the captain/i.test(m)) return "Bu amalni faqat sardor bajara oladi.";
        return "Amalni bajarib bo'lmadi. Keyinroq urinib ko'ring.";
    }

    // Destructive buttons ask twice: the first click changes the label, the second one (within 4 s) does it
    function twice(btn, label, action) {
        let armed = null; const base = btn.textContent;
        btn.addEventListener('click', function () {
            if (armed) { clearTimeout(armed); armed = null; btn.textContent = base; action(); return; }
            btn.textContent = label;
            armed = setTimeout(function () { armed = null; btn.textContent = base; }, 4000);
        });
    }

    function statusPill(team) {
        if (team.is_captain) return el('span', 'pg-pill sun', 'Sardor');
        if (team.my_status === 'active') return el('span', 'pg-pill', "A'zosiz");
        if (team.my_status === 'pending') return el('span', 'pg-pill sun', "So'rov yuborilgan");
        return null;
    }

    // Join request with an optional "hide my name" choice. Returns the button and the label so each page can place them.
    function joinControls(team, session, redraw) {
        const btn = el('button', 'pg-btn', "So'rov yuborish"); btn.type = 'button';
        const lab = el('label', 'pg-muted'); lab.style.cssText = 'display:inline-flex;align-items:center;gap:6px;cursor:pointer';
        const cb = document.createElement('input'); cb.type = 'checkbox'; lab.appendChild(cb); lab.appendChild(document.createTextNode('Ismimni yashirish'));
        btn.addEventListener('click', async function () {
            btn.disabled = true;
            try {
                await send('POST', '/teams/' + team.id + '/join', session, { anonymous: cb.checked });
                G.toast("So'rov yuborildi. Sardor javobini kuting");
                await redraw();
            } catch (err) { G.toast(problem(err)); btn.disabled = false; }
        });
        return { button: btn, label: lab };
    }

    function openTeam(team) { G.ctx.teamId = team.id; G.open('team-detail', 'jamoalar'); }

    // One team in the list: what it does, who opened it, when, how many members
    function teamCard(team, session, redraw) {
        const c = el('article', 'pg-card pg-item');
        c.appendChild(cover(team));
        const pills = el('div'); pills.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
        pills.appendChild(el('span', 'pg-pill', team.direction || 'Boshqa'));
        const st = statusPill(team); if (st) pills.appendChild(st);
        if (team.is_captain && team.pending_requests > 0) pills.appendChild(el('span', 'pg-pill sun', team.pending_requests + " ta yangi so'rov"));
        c.appendChild(pills);
        const h = el('h3', '', team.name); h.style.marginTop = '10px'; c.appendChild(h);
        if (team.sphere) c.appendChild(el('p', 'pg-muted', 'Soha: ' + team.sphere));
        const first = goalLines(team.goals)[0];
        if (first) { const g = el('p', 'pg-muted', 'Maqsad: ' + (first.length > 120 ? first.slice(0, 117) + '...' : first)); g.style.margin = '6px 0 0'; c.appendChild(g); }
        const meta = el('div', 'pg-meta'); meta.style.cssText = 'justify-content:flex-start;gap:4px 16px';
        [[team.members + " a'zo"], ['Ochgan: ' + (team.captain_name || '–')], ['Sana: ' + dateText(team.created_at)]].forEach(function (x) { meta.appendChild(el('span', '', x[0])); });
        c.appendChild(meta);
        const act = el('div'); act.style.cssText = 'margin-top:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center';
        const member = team.is_captain || team.my_status === 'active';
        const open = el('button', member ? 'pg-btn' : 'pg-btn ghost', member ? 'Jamoaga kirish' : 'Batafsil'); open.type = 'button';
        open.addEventListener('click', function () { openTeam(team); });
        act.appendChild(open);
        let hide = null;
        if (!team.my_status && !team.is_captain) { const j = joinControls(team, session, redraw); act.appendChild(j.button); hide = j.label; }
        c.appendChild(act);
        if (hide) { hide.style.marginTop = '10px'; c.appendChild(hide); }
        return c;
    }

    // ---------------- Teams list, my teams, open a team ----------------
    G.register('jamoalar', async function (root, session) {
        let tab = G.ctx.teamsTab || 'all'; G.ctx.teamsTab = null;
        let filter = 'all';

        async function draw() {
            const data = await get('/teams', session);
            const teams = data.teams; const directions = data.directions || [];
            const pg = page(root);
            pg.appendChild(head('Jamoalar', "Birga o'rganing, ma'lumot almashing, bir-biringizga yordam bering. Jamoa ochish va qatnashish tekin."));

            const tabs = el('div', 'pg-tabs'); tabs.setAttribute('role', 'tablist');
            const names = [['all', 'Barcha jamoalar'], ['mine', 'Mening jamoalarim'], ['create', 'Jamoa ochish']];
            const panes = {};
            names.forEach(function (n) {
                const b = el('button', n[0] === tab ? 'on' : '', n[1]); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = n[0];
                b.addEventListener('click', function () {
                    tab = n[0];
                    tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
                    Object.keys(panes).forEach(function (k) { panes[k].hidden = k !== tab; });
                });
                tabs.appendChild(b);
            });
            pg.appendChild(tabs);

            // --- all teams, with direction filter
            const all = el('div'); all.hidden = tab !== 'all'; all.dataset.pane = 'all'; panes.all = all;
            const chips = el('div', 'pg-chips'); const grid = el('div', 'pg-grid');
            function fill() {
                grid.textContent = '';
                const list = teams.filter(function (t) { return filter === 'all' || t.direction === filter; });
                if (!list.length) { grid.appendChild(empty(teams.length ? "Bu yo'nalishda jamoa yo'q." : 'Hali jamoa ochilmagan. Birinchi bo\'ling: "Jamoa ochish" bo\'limidan boshlang.')); return; }
                list.forEach(function (t) { grid.appendChild(teamCard(t, session, draw)); });
            }
            [['all', 'Hammasi']].concat(directions.map(function (d) { return [d, d]; })).forEach(function (d) {
                const c = el('button', 'pg-chip' + (d[0] === filter ? ' on' : ''), d[1]); c.type = 'button';
                c.addEventListener('click', function () {
                    filter = d[0]; chips.querySelectorAll('.pg-chip').forEach(function (x) { x.classList.toggle('on', x === c); }); fill();
                });
                chips.appendChild(c);
            });
            all.appendChild(chips); all.appendChild(grid); fill(); pg.appendChild(all);
            all.appendChild(el('p', 'pg-muted', "Jamoaga qo'shilish uchun so'rov yuboriladi. Jamoa sardori uni qabul qiladi yoki rad etadi."));

            // --- my teams
            const mine = el('div'); mine.hidden = tab !== 'mine'; mine.dataset.pane = 'mine'; panes.mine = mine;
            const myList = teams.filter(function (t) { return t.is_captain || t.my_status; });
            const myGrid = el('div', 'pg-grid');
            if (!myList.length) myGrid.appendChild(empty('Siz hali hech qaysi jamoada emassiz. "Barcha jamoalar" dan qo\'shiling yoki o\'zingiz jamoa oching.'));
            myList.forEach(function (t) { myGrid.appendChild(teamCard(t, session, draw)); });
            mine.appendChild(myGrid); pg.appendChild(mine);

            // --- open a team
            const create = el('div'); create.hidden = tab !== 'create'; create.dataset.pane = 'create'; panes.create = create;
            const wrap = el('div', 'pg-detail');
            const form = el('form', 'pg-card'); form.noValidate = true;
            const iName = el('input', 'pg-input'); iName.type = 'text'; iName.maxLength = 100; iName.placeholder = 'Masalan: Python Sprint';
            const iDir = el('select', 'pg-input');
            const ph = el('option', '', 'Tanlang'); ph.value = ''; iDir.appendChild(ph);
            directions.forEach(function (d) { const o = el('option', '', d); o.value = d; iDir.appendChild(o); });
            const iSphere = el('input', 'pg-input'); iSphere.type = 'text'; iSphere.maxLength = 100; iSphere.placeholder = 'Masalan: Veb dasturlash, IELTS, Algebra';
            const iGoals = el('textarea', 'pg-input'); iGoals.rows = 4; iGoals.maxLength = 500; iGoals.placeholder = 'Jamoa nimaga erishmoqchi? Har bir maqsadni yangi qatordan yozing.';
            const iDesc = el('textarea', 'pg-input'); iDesc.rows = 3; iDesc.maxLength = 1000; iDesc.placeholder = 'Jamoa haqida qisqacha (ixtiyoriy)';
            form.appendChild(field('Jamoa nomi', iName, 'tmNewName'));
            form.appendChild(field("Yo'nalish", iDir, 'tmNewDir'));
            form.appendChild(field('Soha', iSphere, 'tmNewSphere'));
            form.appendChild(field('Jamoa maqsadlari', iGoals, 'tmNewGoals'));
            form.appendChild(field('Jamoa haqida (ixtiyoriy)', iDesc, 'tmNewDesc'));
            const msg = el('p', 'pg-muted'); msg.setAttribute('role', 'alert'); msg.style.cssText = 'min-height:1.2em;margin-top:10px'; form.appendChild(msg);
            const go = el('button', 'pg-btn', 'Jamoani ochish'); go.type = 'submit'; form.appendChild(go);
            form.addEventListener('submit', async function (e) {
                e.preventDefault(); msg.textContent = '';
                if (iName.value.trim().length < 2) { msg.textContent = 'Jamoa nomini kiriting.'; return; }
                if (!iDir.value) { msg.textContent = "Yo'nalishni tanlang."; return; }
                if (!iSphere.value.trim()) { msg.textContent = 'Sohani kiriting.'; return; }
                if (!iGoals.value.trim()) { msg.textContent = 'Jamoa maqsadlarini yozing.'; return; }
                go.disabled = true; go.textContent = 'Ochilmoqda...';
                try {
                    await send('POST', '/teams', session, { name: iName.value, direction: iDir.value, sphere: iSphere.value, goals: iGoals.value, description: iDesc.value });
                    G.toast('"' + iName.value.trim() + '" jamoasi ochildi. Siz sardorsiz');
                    tab = 'mine'; await draw();
                } catch (err) { msg.textContent = problem(err); go.disabled = false; go.textContent = 'Jamoani ochish'; }
            });
            wrap.appendChild(form);

            const auto = card('Avtomatik qo\'shiladi'); auto.style.alignSelf = 'start';
            [['Ochgan', session.name || 'Siz'], ['Ochilgan sana', dateText(new Date())], ["A'zolar soni", "1 (siz, sardor)"]].forEach(function (r) {
                const row = el('div', 'pg-row'); const d = el('div'); d.appendChild(el('span', 'pg-muted', r[0])); d.appendChild(el('b', '', r[1])); row.appendChild(d); auto.appendChild(row);
            });
            const rights = el('p', 'pg-muted', "Sardor so'rovlarni qabul qiladi yoki rad etadi va a'zoni jamoadan chiqara oladi."); rights.style.margin = '10px 0 0'; auto.appendChild(rights);
            wrap.appendChild(auto); create.appendChild(wrap); pg.appendChild(create);
        }
        await draw();
    });

    // ---------------- One team ----------------
    G.register('team-detail', async function (root, session) {
        const id = G.ctx.teamId;
        function back() { G.ctx.teamsTab = 'all'; G.open('jamoalar', 'jamoalar'); }
        function backButton() { const b = el('button', 'pg-btn ghost', '← Jamoalarga qaytish'); b.type = 'button'; b.style.marginBottom = '16px'; b.addEventListener('click', back); return b; }

        async function draw() {
            let team, members, isCaptain;
            try {
                const t = await get('/teams/' + id, session);
                const m = await get('/teams/' + id + '/members', session);
                team = t.team; members = m.members; isCaptain = m.isCaptain;
            } catch (err) {
                if (err.auth) throw err;
                const pg = page(root); pg.appendChild(backButton()); pg.appendChild(empty('Jamoa topilmadi.')); return;
            }
            const pg = page(root); pg.appendChild(backButton());

            // Top: who it is and the automatic facts
            const top = el('div', 'pg-card pg-file'); top.style.marginBottom = '18px';
            top.appendChild(cover(team, 64));
            const d = el('div'); const n = el('h2', '', team.name); n.style.margin = '0'; d.appendChild(n);
            const pills = el('div'); pills.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px';
            pills.appendChild(el('span', 'pg-pill', team.direction || 'Boshqa'));
            const st = statusPill(team); if (st) pills.appendChild(st);
            d.appendChild(pills); top.appendChild(d); pg.appendChild(top);

            const facts = el('div', 'pg-grid'); facts.style.cssText = 'grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-bottom:18px';
            [['Ochgan', team.captain_name || '–'], ['Ochilgan sana', dateText(team.created_at)], ["A'zolar soni", String(team.members)], ['Soha', team.sphere || '–']].forEach(function (f) {
                const c = el('div', 'pg-card'); c.appendChild(el('div', 'pg-muted', f[0])); const v = el('b', '', f[1]); v.style.fontSize = '1.05rem'; c.appendChild(v); facts.appendChild(c);
            });
            pg.appendChild(facts);

            const wrap = el('div', 'pg-detail'); pg.appendChild(wrap);
            const left = el('div'); left.style.cssText = 'display:grid;gap:18px;align-content:start'; wrap.appendChild(left);
            const right = el('div'); right.style.cssText = 'display:grid;gap:18px;align-content:start'; wrap.appendChild(right);

            const goals = card('Jamoa maqsadlari');
            const lines = goalLines(team.goals);
            if (!lines.length) goals.appendChild(empty("Maqsadlar yozilmagan."));
            lines.forEach(function (l) { const r = el('div', 'pg-row'); r.appendChild(el('b', '', l)); goals.appendChild(r); });
            left.appendChild(goals);
            if (team.description) { const about = card('Jamoa haqida'); about.appendChild(el('p', '', team.description)); left.appendChild(about); }

            // Join request / status
            if (!team.my_status && !team.is_captain) {
                const j = card("Jamoaga qo'shilish"); const jc = joinControls(team, session, draw);
                const jr = el('div'); jr.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px'; jr.appendChild(jc.button); jr.appendChild(jc.label);
                j.appendChild(jr); left.appendChild(j);
            }

            // Captain: requests waiting
            const pending = members.filter(function (m) { return m.status === 'pending'; });
            if (isCaptain) {
                const req = card("Qo'shilish so'rovlari");
                if (!pending.length) req.appendChild(empty("Yangi so'rov yo'q."));
                pending.forEach(function (m) {
                    const row = el('div', 'pg-row'); row.style.flexWrap = 'wrap';
                    const who = el('div'); who.style.cssText = 'flex:1 1 100%;min-width:0'; who.appendChild(el('b', '', m.name));
                    row.appendChild(who);
                    const ok = el('button', 'pg-btn', 'Qabul qilish'); ok.type = 'button'; ok.style.padding = '7px 12px';
                    const no = el('button', 'pg-btn danger', 'Rad etish'); no.type = 'button'; no.style.padding = '7px 12px';
                    ok.addEventListener('click', async function () {
                        ok.disabled = true; no.disabled = true;
                        try { await send('POST', '/teams/' + id + '/members/' + m.user_id + '/accept', session); G.toast(m.name + ' jamoaga qabul qilindi'); await draw(); }
                        catch (err) { G.toast(problem(err)); ok.disabled = false; no.disabled = false; }
                    });
                    twice(no, 'Aniqmi?', async function () {
                        try { await send('DELETE', '/teams/' + id + '/members/' + m.user_id, session); G.toast(m.name + " so'rovi rad etildi"); await draw(); }
                        catch (err) { G.toast(problem(err)); }
                    });
                    row.appendChild(ok); row.appendChild(no); req.appendChild(row);
                });
                right.appendChild(req);
            }

            // Members
            const mem = card("A'zolar");
            members.filter(function (m) { return m.status === 'active'; }).forEach(function (m) {
                const row = el('div', 'pg-row');
                const av = el('span', 'pg-av', m.name === 'Anonim' ? '?' : initials(m.name)); av.style.cssText = 'background:' + COLORS[(m.user_id || 0) % COLORS.length] + ';width:38px;height:38px;font-size:13px';
                const mid = el('div'); mid.style.cssText = 'flex:1;min-width:0'; mid.appendChild(el('b', '', m.name));
                row.appendChild(av); row.appendChild(mid);
                if (m.user_id && m.user_id === team.captain_id) row.appendChild(el('span', 'pg-pill sun', 'Sardor'));
                else if (isCaptain && m.user_id) {
                    const kick = el('button', 'pg-btn danger', 'Chiqarish'); kick.type = 'button'; kick.style.padding = '7px 12px';
                    twice(kick, 'Aniqmi?', async function () {
                        try { await send('DELETE', '/teams/' + id + '/members/' + m.user_id, session); G.toast("A'zo jamoadan chiqarildi"); await draw(); }
                        catch (err) { G.toast(problem(err)); }
                    });
                    row.appendChild(kick);
                }
                mem.appendChild(row);
            });
            right.appendChild(mem);
        }
        await draw();
    });
})();
