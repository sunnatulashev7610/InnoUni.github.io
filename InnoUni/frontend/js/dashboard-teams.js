/* Teams for signed-in students: the list, opening a team, and the team page
   (chat, members, about, settings). Real session only. In demo mode the sample pages stay as they are.
   Needs dashboard-data.js and dashboard-team-chat.js.
   Text goes in via textContent only, so nothing a user typed can become markup. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get; const send = G.api.send; const twice = G.twice;

    const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
    const MUTES = [[10, '10 daqiqa'], [60, '1 soat'], [1440, '1 kun']];
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
    function note() { const m = el('p', 'pg-muted'); m.setAttribute('role', 'alert'); m.style.cssText = 'min-height:1.2em;margin-top:10px'; return m; }
    function small(btn) { btn.style.padding = '7px 12px'; return btn; }
    function waitText(sec) {
        if (sec >= 86400) return Math.ceil(sec / 86400) + ' kun';
        if (sec >= 3600) return Math.ceil(sec / 3600) + ' soat';
        return Math.max(1, Math.ceil(sec / 60)) + ' daqiqa';
    }
    // Goals are typed one per line
    const goalLines = (text) => String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);

    function problem(err) {
        const m = String(err && err.message || '');
        if (err && err.auth) return 'Sessiya tugagan. Qayta kiring.';
        if (/already taken/i.test(m)) return 'Bu nom band. Boshqa nom tanlang.';
        if (/at most \d+ teams/i.test(m)) return "Siz ko'pi bilan " + ((m.match(/\d+/) || ['5'])[0]) + ' ta jamoa ocha olasiz.';
        if (/Team is full/i.test(m)) return "Jamoa to'lgan: a'zolar soni chegaraga yetgan.";
        if (/User not found/i.test(m)) return 'Bu email bilan ro\'yxatdan o\'tgan foydalanuvchi topilmadi.';
        if (/Already a member/i.test(m)) return "Bu odam allaqachon jamoa a'zosi.";
        if (/Already requested or invited/i.test(m)) return "Bu odamga so'rov yoki taklif allaqachon bor.";
        if (/Already requested/i.test(m)) return "So'rov allaqachon yuborilgan.";
        if (/cannot invite/i.test(m)) return "Bu jamoada a'zolarni faqat admin taklif qila oladi.";
        if (/Too many invitations/i.test(m)) return "Juda ko'p taklif yuborildi. Keyinroq urinib ko'ring.";
        if (/Invalid email/i.test(m)) return "Email noto'g'ri.";
        if (/No invitation/i.test(m)) return 'Taklif topilmadi.';
        if (/admin cannot leave/i.test(m)) return "Admin jamoadan chiqa olmaydi. Uni o'chirishi mumkin.";
        if (/Only the (admin|owner)/i.test(m)) return 'Bu amalni faqat admin bajara oladi.';
        if (/not available/i.test(m)) return 'Jamoalar hozircha yopiq.';
        return "Amalni bajarib bo'lmadi. Keyinroq urinib ko'ring.";
    }

    // Tabs: panes are all built, only the chosen one is shown
    function tabs(defs, current, panes) {
        const bar = el('div', 'pg-tabs'); bar.setAttribute('role', 'tablist');
        defs.forEach(function (d) {
            const b = el('button', d[0] === current ? 'on' : '', d[1]); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = d[0];
            b.addEventListener('click', function () {
                bar.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
                Object.keys(panes).forEach(function (k) { panes[k].hidden = k !== d[0]; });
                if (tabs.onChange) tabs.onChange(d[0]);
            });
            bar.appendChild(b);
        });
        return bar;
    }

    function statusPill(team) {
        if (team.is_captain) return el('span', 'pg-pill sun', 'Admin');
        if (team.my_status === 'active') return el('span', 'pg-pill', "A'zosiz");
        if (team.invited) return el('span', 'pg-pill sun', 'Taklif qilingan');
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
                G.toast("So'rov yuborildi. Admin javobini kuting");
                await redraw();
            } catch (err) { G.toast(problem(err)); btn.disabled = false; }
        });
        return { button: btn, label: lab };
    }

    // Answer an invitation
    function invitationButtons(team, session, redraw) {
        const ok = el('button', 'pg-btn', 'Qabul qilish'); ok.type = 'button';
        const no = el('button', 'pg-btn ghost', 'Rad etish'); no.type = 'button';
        async function answer(kind, text) {
            ok.disabled = true; no.disabled = true;
            try { await send('POST', '/teams/' + team.id + '/invitation/' + kind, session); G.toast(text); await redraw(); }
            catch (err) { G.toast(problem(err)); ok.disabled = false; no.disabled = false; }
        }
        ok.addEventListener('click', function () { answer('accept', "Jamoaga qo'shildingiz"); });
        no.addEventListener('click', function () { answer('decline', 'Taklif rad etildi'); });
        return { accept: ok, decline: no };
    }

    function openTeam(team, tab) { G.ctx.teamId = team.id; G.ctx.teamTab = tab || null; G.open('team-detail', 'jamoalar'); }

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
        const open = el('button', member ? 'pg-btn' : 'pg-btn ghost', member ? 'Chatga kirish' : 'Batafsil'); open.type = 'button';
        open.addEventListener('click', function () { openTeam(team); });
        let hide = null;
        if (team.invited) {
            const inv = invitationButtons(team, session, redraw);
            act.appendChild(inv.accept); act.appendChild(inv.decline); act.appendChild(open);
        } else {
            act.appendChild(open);
            if (!team.my_status && !team.is_captain) { const j = joinControls(team, session, redraw); act.appendChild(j.button); hide = j.label; }
        }
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
            const limits = data.limits || { maxTeamsPerUser: 5, maxMembers: 100 };
            const pg = page(root);
            pg.appendChild(head('Jamoalar', "Birga o'rganing, chatda fikr almashing, bir-biringizga yordam bering. Jamoa ochish va qatnashish tekin."));

            const names = [['all', 'Barcha jamoalar'], ['mine', 'Mening jamoalarim'], ['create', 'Jamoa ochish']];
            const panes = {};
            tabs.onChange = function (k) { tab = k; };
            pg.appendChild(tabs(names, tab, panes));

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
            all.appendChild(el('p', 'pg-muted', "Jamoaga qo'shilish uchun so'rov yuboriladi. Jamoa admini uni qabul qiladi yoki rad etadi."));

            // --- my teams (invitations first)
            const mine = el('div'); mine.hidden = tab !== 'mine'; mine.dataset.pane = 'mine'; panes.mine = mine;
            const myList = teams.filter(function (t) { return t.is_captain || t.my_status; }).sort(function (a, b) { return Number(b.invited) - Number(a.invited); });
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
            const msg = note(); form.appendChild(msg);
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
                    G.toast('"' + iName.value.trim() + '" jamoasi ochildi. Siz adminsiz');
                    tab = 'mine'; await draw();
                } catch (err) { msg.textContent = problem(err); go.disabled = false; go.textContent = 'Jamoani ochish'; }
            });
            wrap.appendChild(form);

            const auto = card("Avtomatik qo'shiladi"); auto.style.alignSelf = 'start';
            [['Ochgan', session.name || 'Siz'], ['Ochilgan sana', dateText(new Date())], ["A'zolar soni", '1 (siz, admin)']].forEach(function (r) {
                const row = el('div', 'pg-row'); const d = el('div'); d.appendChild(el('span', 'pg-muted', r[0])); d.appendChild(el('b', '', r[1])); row.appendChild(d); auto.appendChild(row);
            });
            const rights = el('p', 'pg-muted', "Siz jamoaning admini bo'lasiz: chatda xabarlarni o'chirasiz, a'zolarni cheklaysiz yoki chiqarasiz, sozlamalarni o'zgartirasiz va jamoani o'chira olasiz."); rights.style.margin = '10px 0 0'; auto.appendChild(rights);
            const lim = el('p', 'pg-muted', 'Chegaralar: bitta odam ' + limits.maxTeamsPerUser + " ta jamoa ocha oladi, jamoada ko'pi bilan " + limits.maxMembers + " a'zo bo'ladi."); lim.style.margin = '10px 0 0'; auto.appendChild(lim);
            wrap.appendChild(auto); create.appendChild(wrap); pg.appendChild(create);
        }
        await draw();
    });

    // ---------------- One team: chat, members, about, settings ----------------
    G.register('team-detail', async function (root, session) {
        const id = G.ctx.teamId;
        let tab = G.ctx.teamTab || null; G.ctx.teamTab = null;
        let chat = null;
        function toList(listTab) { if (chat) chat.stop(); G.ctx.teamsTab = listTab; G.open('jamoalar', 'jamoalar'); }
        function backButton() { const b = el('button', 'pg-btn ghost', '← Jamoalarga qaytish'); b.type = 'button'; b.style.marginBottom = '16px'; b.addEventListener('click', function () { toList('all'); }); return b; }

        async function draw() {
            if (chat) { chat.stop(); chat = null; }
            let team, data;
            try {
                team = (await get('/teams/' + id, session)).team;
                data = await get('/teams/' + id + '/members', session);
            } catch (err) {
                if (err.auth) throw err;
                const pg = page(root); pg.appendChild(backButton()); pg.appendChild(empty('Jamoa topilmadi.')); return;
            }
            const members = data.members; const limits = data.limits || { maxMembers: 100, maxMessageLength: 5000 };
            const isAdmin = team.is_captain;
            const isMember = isAdmin || team.my_status === 'active';
            const canInvite = isAdmin || (isMember && data.invite_mode === 'members');
            const keys = isMember ? ['chat', 'members', 'about'].concat(isAdmin ? ['settings'] : []) : ['about', 'members'];
            if (!tab || keys.indexOf(tab) === -1) tab = isMember ? 'chat' : 'about';

            const pg = page(root); pg.appendChild(backButton());

            // Top: who it is
            const top = el('div', 'pg-card pg-file'); top.style.marginBottom = '18px';
            top.appendChild(cover(team, 64));
            const d = el('div'); const n = el('h2', '', team.name); n.style.margin = '0'; d.appendChild(n);
            const pills = el('div'); pills.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px';
            pills.appendChild(el('span', 'pg-pill', team.direction || 'Boshqa'));
            const st = statusPill(team); if (st) pills.appendChild(st);
            d.appendChild(pills); top.appendChild(d); pg.appendChild(top);

            // Join / invitation / request strip
            if (team.invited) {
                const c = card('Sizni jamoaga taklif qilishdi'); c.style.marginBottom = '18px';
                const inv = invitationButtons(team, session, draw);
                const r = el('div'); r.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px'; r.appendChild(inv.accept); r.appendChild(inv.decline);
                c.appendChild(r); pg.appendChild(c);
            } else if (team.my_status === 'pending') {
                const c = card("So'rovingiz yuborildi"); c.style.marginBottom = '18px';
                c.appendChild(empty('Admin qabul qilgach, chat ochiladi.'));
                const cancel = el('button', 'pg-btn ghost', 'Bekor qilish'); cancel.type = 'button';
                cancel.addEventListener('click', async function () {
                    cancel.disabled = true;
                    try { await send('POST', '/teams/' + id + '/leave', session); G.toast("So'rov bekor qilindi"); await draw(); }
                    catch (err) { G.toast(problem(err)); cancel.disabled = false; }
                });
                c.appendChild(cancel); pg.appendChild(c);
            } else if (!isMember) {
                const c = card("Jamoaga qo'shilish"); c.style.marginBottom = '18px';
                if (team.members >= limits.maxMembers) c.appendChild(empty("Jamoa to'lgan."));
                else {
                    const j = joinControls(team, session, draw);
                    const jr = el('div'); jr.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px'; jr.appendChild(j.button); jr.appendChild(j.label);
                    c.appendChild(jr);
                }
                pg.appendChild(c);
            }

            const facts = el('div', 'pg-grid'); facts.style.cssText = 'grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:18px';
            [['Ochgan', team.captain_name || '–'], ['Ochilgan sana', dateText(team.created_at)], ["A'zolar soni", team.members + ' / ' + limits.maxMembers], ['Soha', team.sphere || '–']].forEach(function (f) {
                const c = el('div', 'pg-card'); c.appendChild(el('div', 'pg-muted', f[0])); const v = el('b', '', f[1]); v.style.fontSize = '1.05rem'; c.appendChild(v); facts.appendChild(c);
            });
            pg.appendChild(facts);

            const labels = { chat: 'Chat', members: "A'zolar", about: 'Haqida', settings: 'Sozlamalar' };
            const panes = {};
            keys.forEach(function (k) { const p = el('div'); p.hidden = k !== tab; p.dataset.pane = k; panes[k] = p; });
            tabs.onChange = function (k) { tab = k; };
            pg.appendChild(tabs(keys.map(function (k) { return [k, labels[k]]; }), tab, panes));
            keys.forEach(function (k) { pg.appendChild(panes[k]); });

            // ---- Chat
            if (isMember) {
                chat = G.teamChat(team, session);
                panes.chat.appendChild(chat.node);
                await chat.ready;
            }

            // ---- Members
            const mp = panes.members; mp.style.cssText = 'display:grid;gap:18px';
            if (canInvite) {
                const inv = card("A'zo taklif qilish");
                const form = el('form'); form.noValidate = true;
                const email = el('input', 'pg-input'); email.type = 'email'; email.maxLength = 255; email.autocomplete = 'off'; email.placeholder = 'Taklif qilinadigan odamning emaili';
                form.appendChild(field('Email', email, 'tmInviteEmail'));
                const msg = note(); form.appendChild(msg);
                const go = el('button', 'pg-btn', 'Taklif qilish'); go.type = 'submit'; form.appendChild(go);
                form.addEventListener('submit', async function (e) {
                    e.preventDefault(); msg.textContent = '';
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { msg.textContent = "Email noto'g'ri."; return; }
                    go.disabled = true;
                    try {
                        const out = await send('POST', '/teams/' + id + '/invite', session, { email: email.value });
                        G.toast((out.name || 'Foydalanuvchi') + ' taklif qilindi');
                        tab = 'members'; await draw();
                    } catch (err) { msg.textContent = problem(err); go.disabled = false; }
                });
                inv.appendChild(form);
                const hint = empty("Odam ilovada shu email bilan ro'yxatdan o'tgan bo'lishi kerak. U taklifni qabul qilgach jamoaga qo'shiladi."); hint.style.marginTop = '12px'; inv.appendChild(hint);
                mp.appendChild(inv);
            } else if (isMember) {
                mp.appendChild(empty("A'zolarni faqat admin taklif qila oladi."));
            }

            if (isAdmin) {
                const reqs = members.filter(function (m) { return m.status === 'pending' && !m.invited; });
                const invs = members.filter(function (m) { return m.status === 'pending' && m.invited; });
                const rc = card("Qo'shilish so'rovlari");
                if (!reqs.length) rc.appendChild(empty("Yangi so'rov yo'q."));
                reqs.forEach(function (m) {
                    const row = el('div', 'pg-row'); row.style.flexWrap = 'wrap';
                    const who = el('div'); who.style.cssText = 'flex:1 1 100%;min-width:0'; who.appendChild(el('b', '', m.name)); row.appendChild(who);
                    const ok = small(el('button', 'pg-btn', 'Qabul qilish')); ok.type = 'button';
                    const no = small(el('button', 'pg-btn danger', 'Rad etish')); no.type = 'button';
                    ok.addEventListener('click', async function () {
                        ok.disabled = true; no.disabled = true;
                        try { await send('POST', '/teams/' + id + '/members/' + m.user_id + '/accept', session); G.toast(m.name + " jamoaga qabul qilindi"); await draw(); }
                        catch (err) { G.toast(problem(err)); ok.disabled = false; no.disabled = false; }
                    });
                    twice(no, 'Aniqmi?', async function () {
                        try { await send('DELETE', '/teams/' + id + '/members/' + m.user_id, session); G.toast(m.name + " so'rovi rad etildi"); await draw(); }
                        catch (err) { G.toast(problem(err)); }
                    });
                    row.appendChild(ok); row.appendChild(no); rc.appendChild(row);
                });
                mp.appendChild(rc);
                if (invs.length) {
                    const ic = card('Yuborilgan takliflar');
                    invs.forEach(function (m) {
                        const row = el('div', 'pg-row');
                        const who = el('div'); who.style.cssText = 'flex:1;min-width:0'; who.appendChild(el('b', '', m.name)); who.appendChild(el('div', 'pg-muted', 'Javob kutilmoqda')); row.appendChild(who);
                        const cancel = small(el('button', 'pg-btn ghost', 'Bekor qilish')); cancel.type = 'button';
                        cancel.addEventListener('click', async function () {
                            cancel.disabled = true;
                            try { await send('DELETE', '/teams/' + id + '/members/' + m.user_id, session); G.toast('Taklif bekor qilindi'); await draw(); }
                            catch (err) { G.toast(problem(err)); cancel.disabled = false; }
                        });
                        row.appendChild(cancel); ic.appendChild(row);
                    });
                    mp.appendChild(ic);
                }
            }

            const active = members.filter(function (m) { return m.status === 'active'; });
            const mem = card("A'zolar (" + active.length + ' / ' + limits.maxMembers + ')');
            active.forEach(function (m) {
                const row = el('div', 'pg-row'); row.style.flexWrap = 'wrap';
                const av = el('span', 'pg-av', m.name === 'Anonim' ? '?' : initials(m.name)); av.style.cssText = 'background:' + COLORS[(m.user_id || 0) % COLORS.length] + ';width:38px;height:38px;font-size:13px';
                const mid = el('div'); mid.style.cssText = 'flex:1;min-width:120px'; mid.appendChild(el('b', '', m.name));
                row.appendChild(av); row.appendChild(mid);
                if (m.is_admin) row.appendChild(el('span', 'pg-pill sun', 'Admin'));
                else if (isAdmin && m.user_id) {
                    if (m.muted_seconds > 0) {
                        row.appendChild(el('span', 'pg-pill coral', 'Cheklangan: ' + waitText(m.muted_seconds)));
                        const lift = small(el('button', 'pg-btn ghost', 'Cheklovni olish')); lift.type = 'button';
                        lift.addEventListener('click', async function () {
                            lift.disabled = true;
                            try { await send('DELETE', '/teams/' + id + '/members/' + m.user_id + '/mute', session); G.toast('Cheklov olib tashlandi'); await draw(); }
                            catch (err) { G.toast(problem(err)); lift.disabled = false; }
                        });
                        row.appendChild(lift);
                    } else {
                        const sel = el('select', 'pg-input'); sel.style.cssText = 'width:auto;padding:6px 10px'; sel.setAttribute('aria-label', m.name + ': yozishni cheklash');
                        const ph = el('option', '', 'Yozishni cheklash'); ph.value = ''; sel.appendChild(ph);
                        MUTES.forEach(function (x) { const o = el('option', '', x[1]); o.value = String(x[0]); sel.appendChild(o); });
                        sel.addEventListener('change', async function () {
                            if (!sel.value) return;
                            const minutes = Number(sel.value); sel.disabled = true;
                            try { await send('POST', '/teams/' + id + '/members/' + m.user_id + '/mute', session, { minutes: minutes }); G.toast(m.name + ' cheklandi'); await draw(); }
                            catch (err) { G.toast(problem(err)); sel.disabled = false; sel.value = ''; }
                        });
                        row.appendChild(sel);
                    }
                    const kick = small(el('button', 'pg-btn danger', 'Chiqarish')); kick.type = 'button';
                    twice(kick, 'Aniqmi?', async function () {
                        try { await send('DELETE', '/teams/' + id + '/members/' + m.user_id, session); G.toast("A'zo jamoadan chiqarildi"); await draw(); }
                        catch (err) { G.toast(problem(err)); }
                    });
                    row.appendChild(kick);
                }
                mem.appendChild(row);
            });
            mp.appendChild(mem);

            // ---- About
            const ap = panes.about; ap.style.cssText = 'display:grid;gap:18px';
            const goals = card('Jamoa maqsadlari');
            const lines = goalLines(team.goals);
            if (!lines.length) goals.appendChild(empty('Maqsadlar yozilmagan.'));
            lines.forEach(function (l) { const r = el('div', 'pg-row'); r.appendChild(el('b', '', l)); goals.appendChild(r); });
            ap.appendChild(goals);
            if (team.description) { const about = card('Jamoa haqida'); about.appendChild(el('p', '', team.description)); ap.appendChild(about); }
            const rules = card('Jamoa qoidalari');
            [
                "Jamoada ko'pi bilan " + limits.maxMembers + " a'zo bo'ladi.",
                'Xabar ' + String(limits.maxMessageLength).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' belgigacha bo\'lishi mumkin.',
                "Ketma-ket juda ko'p xabar yozilsa (spam), yozish vaqtincha cheklanadi.",
                "Admin nomaqbul xabarni o'chirishi va a'zoni vaqtincha yozishdan cheklashi mumkin.",
                "A'zolarni taklif qilish: " + (team.invite_mode === 'members' ? "barcha a'zolar" : 'faqat admin') + '.'
            ].forEach(function (t) { const r = el('div', 'pg-row'); r.appendChild(el('span', '', t)); rules.appendChild(r); });
            ap.appendChild(rules);
            if (isMember && !isAdmin) {
                const lc = card('Jamoadan chiqish');
                lc.appendChild(empty("Chiqsangiz, chat yopiladi. Qayta qo'shilish uchun yangi so'rov yuborish kerak bo'ladi."));
                const leave = el('button', 'pg-btn danger', 'Jamoadan chiqish'); leave.type = 'button';
                twice(leave, 'Aniqmi?', async function () {
                    try { await send('POST', '/teams/' + id + '/leave', session); G.toast('Jamoadan chiqdingiz'); toList('all'); }
                    catch (err) { G.toast(problem(err)); }
                });
                lc.appendChild(leave); ap.appendChild(lc);
            }

            // ---- Settings (admin)
            if (isAdmin) {
                const sp = panes.settings; sp.style.cssText = 'display:grid;gap:18px';
                const form = el('form', 'pg-card'); form.noValidate = true; form.appendChild(el('h3', 'pg-h3', 'Jamoa sozlamalari'));
                const sName = el('input', 'pg-input'); sName.type = 'text'; sName.maxLength = 100; sName.value = team.name;
                const sDir = el('select', 'pg-input');
                ((await get('/teams', session)).directions || []).forEach(function (x) { const o = el('option', '', x); o.value = x; sDir.appendChild(o); });
                sDir.value = team.direction;
                const sSphere = el('input', 'pg-input'); sSphere.type = 'text'; sSphere.maxLength = 100; sSphere.value = team.sphere || '';
                const sGoals = el('textarea', 'pg-input'); sGoals.rows = 4; sGoals.maxLength = 500; sGoals.value = team.goals || '';
                const sDesc = el('textarea', 'pg-input'); sDesc.rows = 3; sDesc.maxLength = 1000; sDesc.value = team.description || '';
                const sInvite = el('select', 'pg-input');
                [['admin', 'Faqat admin'], ['members', "Barcha a'zolar"]].forEach(function (x) { const o = el('option', '', x[1]); o.value = x[0]; sInvite.appendChild(o); });
                sInvite.value = team.invite_mode || 'admin';
                form.appendChild(field('Jamoa nomi', sName, 'tsName'));
                form.appendChild(field("Yo'nalish", sDir, 'tsDir'));
                form.appendChild(field('Soha', sSphere, 'tsSphere'));
                form.appendChild(field('Jamoa maqsadlari', sGoals, 'tsGoals'));
                form.appendChild(field('Jamoa haqida', sDesc, 'tsDesc'));
                form.appendChild(field("A'zolarni kim taklif qila oladi", sInvite, 'tsInvite'));
                const msg = note(); form.appendChild(msg);
                const save = el('button', 'pg-btn', 'Saqlash'); save.type = 'submit'; form.appendChild(save);
                form.addEventListener('submit', async function (e) {
                    e.preventDefault(); msg.textContent = '';
                    if (sName.value.trim().length < 2) { msg.textContent = 'Jamoa nomini kiriting.'; return; }
                    if (!sSphere.value.trim()) { msg.textContent = 'Sohani kiriting.'; return; }
                    if (!sGoals.value.trim()) { msg.textContent = 'Jamoa maqsadlarini yozing.'; return; }
                    save.disabled = true; save.textContent = 'Saqlanmoqda...';
                    try {
                        await send('PUT', '/teams/' + id, session, { name: sName.value, direction: sDir.value, sphere: sSphere.value, goals: sGoals.value, description: sDesc.value, invite_mode: sInvite.value });
                        G.toast('Sozlamalar saqlandi'); tab = 'settings'; await draw();
                    } catch (err) { msg.textContent = problem(err); save.disabled = false; save.textContent = 'Saqlash'; }
                });
                sp.appendChild(form);

                const danger = card("Jamoani o'chirish"); danger.style.borderColor = 'var(--danger)';
                danger.appendChild(empty("Jamoa, uning chati va barcha a'zolari butunlay o'chiriladi. Buni qaytarib bo'lmaydi."));
                const confirm = el('input', 'pg-input'); confirm.type = 'text'; confirm.autocomplete = 'off'; confirm.placeholder = team.name;
                danger.appendChild(field("Tasdiqlash uchun jamoa nomini yozing: " + team.name, confirm, 'tsDeleteName'));
                const del = el('button', 'pg-btn danger', "Jamoani o'chirish"); del.type = 'button'; del.disabled = true; del.style.marginTop = '12px';
                confirm.addEventListener('input', function () { del.disabled = confirm.value.trim() !== team.name; });
                del.addEventListener('click', async function () {
                    if (confirm.value.trim() !== team.name) return;
                    del.disabled = true;
                    try { await send('DELETE', '/teams/' + id, session); G.toast("Jamoa o'chirildi"); toList('all'); }
                    catch (err) { G.toast(problem(err)); del.disabled = false; }
                });
                danger.appendChild(del); sp.appendChild(danger);
            }
        }
        await draw();
    });
})();
