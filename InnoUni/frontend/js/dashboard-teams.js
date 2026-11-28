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
        if (/Only the team admin can start a battle/i.test(m)) return "Battle'ni faqat jamoa admini boshlay oladi.";
        if (/needs at least \d+ active members/i.test(m)) return 'Jamoada kamida ' + ((m.match(/\d+/) || ['3'])[0]) + " ta faol a'zo bo'lishi kerak.";
        if (/fewer than \d+ active members/i.test(m)) return 'Raqib jamoada faol a\'zolar yetarli emas (kamida ' + ((m.match(/than (\d+)/) || [0, '3'])[1]) + ').';
        if (/battle each other at most/i.test(m)) return "Bu ikki jamoa haftasiga ko'pi bilan 2 marta battle o'tkaza oladi.";
        if (/open battles per team/i.test(m)) return "Jamoada bir vaqtda ko'pi bilan 3 ta ochiq battle bo'lishi mumkin.";
        if (/Choose (your team|at least one|1 to)/i.test(m)) return "Jamoangizni va 1–5 ta raqib jamoani tanlang.";
        if (/cannot challenge itself/i.test(m)) return "Jamoa o'zini chorlay olmaydi.";
        if (/Duration must be/i.test(m)) return 'Davomiylik 1–7 kun bo\'lsin.';
        if (/AI is not connected|not available right now/i.test(m)) return "Savollar tayyorlanmadi: sun'iy intellekt hozir ulanmagan. Keyinroq urinib ko'ring.";
        if (/Could not (make|generate|prepare)/i.test(m)) return "Savollarni tayyorlab bo'lmadi. Yana bir marta bosing.";
        if (/Already answered/i.test(m)) return 'Bu savolga javob allaqachon berilgan.';
        if (/Registration is closed/i.test(m)) return "Ro'yxatdan o'tish yopilgan.";
        if (/already registered/i.test(m)) return "Bu jamoa allaqachon ro'yxatdan o'tgan.";
        if (/tournament is full/i.test(m)) return "Turnirda joy qolmagan (eng ko'pi 16 jamoa).";
        if (/needs at least \d+ active members/i.test(m)) return "Jamoada kamida 3 ta faol a'zo bo'lishi kerak.";
        if (/Only the team admin can do this/i.test(m)) return "Buni faqat jamoa admini qila oladi.";
        if (/valid https/i.test(m)) return "Havola https:// bilan boshlanishi va to'g'ri bo'lishi kerak.";
        if (/Link is too long/i.test(m)) return 'Havola juda uzun.';
        if (/Only the admin of a playing team/i.test(m)) return "Loyihani faqat o'ynayotgan jamoaning admini topshira oladi.";
        if (/not active any more/i.test(m)) return 'Battle vaqti tugagan. Loyiha qabul qilinmaydi.';
        if (/not active|already finished|has ended/i.test(m)) return 'Battle vaqti tugagan. Javob qabul qilinmaydi.';
        if (/Only the admin of a team in this battle/i.test(m)) return "E'tirozni faqat battledagi jamoaning admini yubora oladi.";
        if (/already objected/i.test(m)) return "Jamoangiz bu natijaga allaqachon e'tiroz bildirgan.";
        if (/time to object/i.test(m)) return "E'tiroz muddati (48 soat) tugagan.";
        if (/result is not ready/i.test(m)) return 'Natija hali tayyor emas.';
        if (/Reason must be at least/i.test(m)) return "Sababni kamida 10 ta belgi bilan yozing.";
        if (/Reason must be at most/i.test(m)) return "Sabab 500 belgidan oshmasin.";
        if (/Reason is required/i.test(m)) return "Sababni yozing.";
        if (/no longer waiting/i.test(m)) return "Bu battle endi javob kutmayapti.";
        if (/have not answered/i.test(m)) return "Ba'zi jamoalar hali javob bermagan.";
        if (/At least one team must accept/i.test(m)) return "Kamida bitta jamoa qabul qilishi kerak.";
        if (/No invitation to answer/i.test(m)) return "Sizning jamoalaringizga javob kutayotgan chaqiriq yo'q.";
        if (/Only the (admin|owner)/i.test(m)) return 'Bu amalni faqat admin bajara oladi.';
        if (/must be in the future/i.test(m)) return "Uchrashuv vaqti kelajakda bo'lsin.";
        if (/too far ahead/i.test(m)) return "Uchrashuvni 1 yildan ortiq oldin rejalab bo'lmaydi.";
        if (/At most \d+ upcoming/i.test(m)) return "Rejalashtirilgan uchrashuvlar juda ko'p. Eskilarini o'chiring.";
        if (/Too many resources/i.test(m)) return "Bugun juda ko'p havola qo'shdingiz. Ertaga urinib ko'ring.";
        if (/restricted from writing/i.test(m)) return "Hozir yozish cheklangan. Keyinroq urinib ko'ring.";
        if (/own resource/i.test(m)) return "O'z havolangizga ovoz bera olmaysiz.";
        if (/not taking new people/i.test(m)) return "Hozir bu jamoa yangi a'zo qabul qilmayapti.";
        if (/not available/i.test(m)) return 'Jamoalar hozircha yopiq.';
        return "Amalni bajarib bo'lmadi. Keyinroq urinib ko'ring.";
    }

    // ---- Battles: a team admin challenges other teams; invited admins accept or decline; the host starts it
    const BATTLE_MIN_MEMBERS = 3;
    const KIND_TEXT = { quiz: 'Viktorina', project: 'Loyiha' };
    const STATE_TEXT = { host: 'Chorlovchi', invited: 'Javob kutilmoqda', accepted: 'Qabul qildi', declined: 'Rad etdi' };
    function battleStatus(b) {
        if (b.status === 'cancelled') return ['Bekor qilingan', ''];
        if (b.status === 'finished') return ['Tugagan', ''];
        if (b.status === 'judging') return ['Hakam baholamoqda', 'sun'];
        if (b.status === 'active') return new Date(b.ends_at).getTime() < Date.now() ? ['Vaqt tugadi, natija kutilmoqda', 'sun'] : ['Davom etmoqda', ''];
        return ['Javoblar kutilmoqda', 'sun'];
    }
    // A link is clickable only when it is https; its text is always the plain address
    function linkNode(url) {
        if (!/^https:\/\//i.test(String(url))) return el('span', '', String(url));
        const a = el('a', '', String(url)); a.href = String(url); a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
    }
    // Results table: place, team, score, how many played (text only)
    function resultTable(b) {
        const t = el('table', 'pg-table'); const hr = el('tr');
        ['O\'rin', 'Jamoa', 'Ball', 'Ishtirokchi'].forEach(function (h) { hr.appendChild(el('th', '', h)); }); t.appendChild(hr);
        b.teams.filter(function (x) { return x.result; }).sort(function (a, c) { return a.result.place - c.result.place; }).forEach(function (x) {
            const r = el('tr'); [x.result.place, x.name, x.result.score, x.result.participants].forEach(function (v) { r.appendChild(el('td', '', String(v))); }); t.appendChild(r);
        });
        return t;
    }
    // One question at a time; answers are saved at once and not graded until the end
    async function quizPane(session, b, onDone) {
        const box = el('div', 'pg-card'); box.dataset.quiz = String(b.id);
        let q;
        try { q = await get('/battles/' + b.id + '/quiz', session); } catch (err) { box.appendChild(empty(problem(err))); return box; }
        const qs = q.questions || []; const done = q.status === 'finished';
        let i = Math.max(0, qs.findIndex(function (x) { return x.my_choice === null; })); if (done || i < 0) i = 0;
        const body = el('div'); box.appendChild(body);
        function draw() {
            body.textContent = '';
            const x = qs[i]; if (!x) { body.appendChild(empty('Savollar yo\'q.')); return; }
            const answered = qs.filter(function (k) { return k.my_choice !== null; }).length;
            body.appendChild(el('p', 'pg-muted', 'Savol ' + (i + 1) + ' / ' + qs.length + ' · Javob berilgan: ' + answered));
            body.appendChild(el('h3', 'pg-h3', x.question));
            const msg = note();
            x.options.forEach(function (o, k) {
                const bt = el('button', 'pg-btn ghost', String.fromCharCode(65 + k) + '. ' + o); bt.type = 'button'; bt.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0';
                if (done) { if (k === x.correct) bt.classList.remove('ghost'); if (x.my_choice === k) bt.textContent += k === x.correct ? '  ✓ sizniki' : '  ✗ sizniki'; bt.disabled = true; }
                else if (x.my_choice !== null) { bt.disabled = true; if (x.my_choice === k) { bt.classList.remove('ghost'); bt.textContent += '  (tanlandi)'; } }
                else bt.addEventListener('click', async function () {
                    try { await send('POST', '/battles/' + b.id + '/answer', session, { question_id: x.id, choice: k }); x.my_choice = k; draw(); } catch (err) { msg.textContent = problem(err); }
                });
                body.appendChild(bt);
            });
            if (done && x.explanation) body.appendChild(el('p', 'pg-muted', 'Izoh: ' + x.explanation));
            body.appendChild(msg);
            const nav = el('div'); nav.style.cssText = 'display:flex;gap:8px;margin-top:8px';
            const prev = small(el('button', 'pg-btn ghost', 'Oldingi')); prev.type = 'button'; prev.disabled = i === 0; prev.addEventListener('click', function () { i--; draw(); });
            const next = small(el('button', 'pg-btn', 'Keyingi')); next.type = 'button'; next.disabled = i >= qs.length - 1; next.addEventListener('click', function () { i++; draw(); });
            const close = small(el('button', 'pg-btn ghost', 'Yopish')); close.type = 'button'; close.addEventListener('click', onDone);
            nav.appendChild(prev); nav.appendChild(next); nav.appendChild(close); body.appendChild(nav);
        }
        draw();
        return box;
    }
    // Team battle record: rating, league, badges, trophies (text only)
    async function recordCard(session, teamId) {
        let r; try { r = await get('/battles/teams/' + teamId + '/record', session); } catch (e) { return null; }
        if (!r || typeof r.rating !== 'number') return null;
        const c = el('div', 'pg-card'); c.dataset.record = String(teamId);
        c.appendChild(el('h3', 'pg-h3', 'Battle yutuqlari'));
        const top = el('div'); top.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
        top.appendChild(el('b', '', r.rating + ' ball')); top.appendChild(el('span', 'pg-pill sun', r.league + ' liga'));
        c.appendChild(top);
        c.appendChild(el('p', 'pg-muted', 'O\'ynagan: ' + r.played + ' · G\'alaba: ' + r.wins));
        if ((r.badges || []).length) { const bw = el('div'); bw.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px'; r.badges.forEach(function (x) { bw.appendChild(el('span', 'pg-pill', x.name)); }); c.appendChild(bw); }
        if (r.streak >= 2) c.appendChild(el('span', 'pg-pill', '🔥 ' + r.streak + " ta g'alaba ketma-ket"));
        const recent = Array.isArray(r.recent) ? r.recent : [];
        if (recent.length) {
            const RES = { win: "G'alaba", draw: 'Durang', loss: "Mag'lubiyat" };
            const form = el('p', 'pg-muted', "So'nggi o'yinlar: " + recent.map(function (x) { return x.result === 'win' ? "G'" : x.result === 'draw' ? 'D' : 'M'; }).join(' '));
            form.dataset.form = '1'; c.appendChild(form);
            recent.forEach(function (x) {
                const line = el('div', 'pg-muted'); line.dataset.game = String(x.battle_id);
                line.textContent = (RES[x.result] || '') + ' · ' + (x.opponent || 'Raqibsiz') + ' · ' + x.score + ' : ' + x.opponent_score;
                c.appendChild(line);
            });
        }
        if ((r.trophies || []).length) { c.appendChild(el('p', 'pg-muted', 'Kuboklar:')); r.trophies.forEach(function (x) { c.appendChild(el('div', '', '🏆 ' + x.title)); }); }
        else c.appendChild(el('p', 'pg-muted', "Hali kubok yo'q. Birinchi g'alabangiz kubok beradi."));
        return c;
    }
    async function leaderboardCard(session) {
        let r; try { r = await get('/battles/leaderboard', session); } catch (e) { return null; }
        if (!r || !Array.isArray(r.teams)) return null;
        const c = card('Battle reytingi');
        if (!r.teams.length) { c.appendChild(empty("Hali battle o'ynalmagan.")); return c; }
        const t = el('table', 'pg-table'); const hr = el('tr');
        ['#', 'Jamoa', 'Liga', 'Ball', "G'alaba"].forEach(function (h) { hr.appendChild(el('th', '', h)); }); t.appendChild(hr);
        r.teams.forEach(function (x, i) { const tr = el('tr'); [i + 1, x.name, x.league, x.rating, x.wins].forEach(function (v) { tr.appendChild(el('td', '', String(v))); }); t.appendChild(tr); });
        c.appendChild(t); return c;
    }
    // Personal results: my numbers and the best players (names are short: "Ali V."). Everything is set with textContent.
    async function playersPane(session) {
        const box = el('div'); box.style.cssText = 'display:grid;gap:18px';
        let me = null; let top = null;
        try { me = await get('/battles/players/me', session); } catch (e) { if (e.auth) throw e; }
        try { top = await get('/battles/players/leaderboard', session); } catch (e) { if (e.auth) throw e; }
        const mine = card('Mening natijam');
        if (!me) mine.appendChild(empty("Natijani yuklab bo'lmadi."));
        else if (!me.battles) mine.appendChild(empty("Hali natija yo'q. Jamoangiz battle o'ynaganda va siz savollarga javob berganingizda bu yerda ko'rinadi."));
        else {
            const row = el('div'); row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap'; row.dataset.myStats = '1';
            [['Battle', me.battles], ["To'g'ri javob", me.correct + ' / ' + me.answered], ['Aniqlik', me.accuracy + '%'], ['MVP', me.mvp]].forEach(function (x) {
                const b = el('div', 'pg-card'); b.appendChild(el('div', 'pg-muted', x[0])); b.appendChild(el('b', '', String(x[1]))); row.appendChild(b);
            });
            mine.appendChild(row);
            const bw = el('div'); bw.dataset.myBadges = '1'; bw.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px';
            (me.badges || []).forEach(function (b) { bw.appendChild(el('span', 'pg-pill', '🏅 ' + b.name)); });
            mine.appendChild(bw);
        }
        box.appendChild(mine);
        const board = card("Eng yaxshi o'yinchilar");
        const players = top && Array.isArray(top.players) ? top.players : null;
        if (!players) board.appendChild(empty("Jadvalni yuklab bo'lmadi."));
        else if (!players.length) board.appendChild(empty("Hali natija yo'q."));
        else {
            const t = el('table', 'pg-table'); const hr = el('tr');
            ['#', "O'yinchi", "To'g'ri", 'Aniqlik', 'Battle'].forEach(function (h) { hr.appendChild(el('th', '', h)); }); t.appendChild(hr);
            players.forEach(function (x, i) {
                const tr = el('tr'); if (x.me) { tr.dataset.me = '1'; tr.style.fontWeight = '700'; }
                [i + 1, x.name + (x.me ? ' (siz)' : ''), x.correct, x.accuracy + '%', x.battles].forEach(function (v) { tr.appendChild(el('td', '', String(v))); }); t.appendChild(tr);
            });
            board.appendChild(t);
            board.appendChild(el('p', 'pg-muted', "Jamoada anonim o'ynaydigan a'zolar jadvalda ko'rsatilmaydi."));
        }
        box.appendChild(board);
        return box;
    }
    // ---- Hall of Fame: champions of the seasonal tournaments
    async function famePane(session) {
        const box = el('div'); box.style.cssText = 'display:grid;gap:18px';
        let r = null;
        try { r = await get('/tournaments/champions', session); } catch (e) { if (e.auth) throw e; }
        const c = card('Shon-sharaf zali');
        if (!r || !Array.isArray(r.champions)) c.appendChild(empty("Ro'yxatni yuklab bo'lmadi."));
        else if (!r.champions.length) c.appendChild(empty("Hali chempion yo'q. Birinchi mavsumiy turnir g'olibi shu yerga yoziladi."));
        else {
            r.champions.forEach(function (x) {
                const row = el('div'); row.dataset.champion = String(x.id); row.style.cssText = 'display:flex;gap:10px;align-items:center;padding:6px 0;flex-wrap:wrap';
                row.appendChild(el('span', '', '🏆')); row.appendChild(el('b', '', x.team_name));
                row.appendChild(el('span', 'pg-muted', x.title + ' · ' + x.topic + (x.finished_at ? ' · ' + String(x.finished_at).slice(0, 10) : '')));
                c.appendChild(row);
            });
        }
        box.appendChild(c);
        if (r && r.teams && r.teams.length) {
            const t = card("Eng ko'p kubok");
            r.teams.forEach(function (x, i) { const row = el('div'); row.dataset.titles = String(x.team_id); row.textContent = (i + 1) + '. ' + x.name + ' · ' + x.titles + ' ta kubok'; t.appendChild(row); });
            box.appendChild(t);
        }
        return box;
    }
    async function battlesPane(session, teams, refresh) {
        const box = el('div'); box.style.cssText = 'display:grid;gap:18px';
        const mineAdmin = teams.filter(function (t) { return t.is_captain; });

        // The list of battles (also the place to answer, start and cancel)
        const listCard = card('Battlelarim'); const listBody = el('div'); listCard.appendChild(listBody);
        async function drawList() {
            listBody.textContent = '';
            let r;
            try { r = await get('/battles', session); } catch (err) { listBody.appendChild(empty(problem(err))); return; }
            const all = r.battles || [];
            if (!all.length) { listBody.appendChild(empty("Hali battle yo'q. Jamoa admini boshqa jamoani chorlashi mumkin.")); return; }
            all.forEach(function (b) {
                const row = el('div', 'pg-card'); row.style.marginBottom = '12px';
                const head = el('div'); head.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
                head.appendChild(el('b', '', b.title));
                head.appendChild(el('span', 'pg-pill', KIND_TEXT[b.kind] || b.kind));
                const st = battleStatus(b); head.appendChild(el('span', 'pg-pill ' + st[1], st[0]));
                row.appendChild(head);
                row.appendChild(el('p', 'pg-muted', 'Mavzu: ' + b.topic));
                const parts = el('div'); parts.style.cssText = 'display:grid;gap:4px;margin:8px 0';
                b.teams.forEach(function (t) {
                    const line = el('div', 'pg-muted', t.name + ' · ' + (STATE_TEXT[t.state] || t.state) + (b.kind === 'project' && (t.state === 'host' || t.state === 'accepted') && b.status !== 'invited' ? ' · ' + (t.submitted ? 'topshirdi' : 'hali topshirmagan') : ''));
                    if (t.submission && b.status === 'finished') { line.appendChild(document.createTextNode(' · ')); line.appendChild(linkNode(t.submission.link)); }
                    parts.appendChild(line);
                });
                row.appendChild(parts);
                row.appendChild(el('p', 'pg-muted', b.status === 'active' ? 'Tugaydi: ' + new Date(b.ends_at).toLocaleString('uz-UZ') : 'Davomiyligi: ' + b.duration_days + ' kun'));
                const msg = note(); const acts = el('div'); acts.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
                async function call(path, body, okText) {
                    msg.textContent = '';
                    try { await send('POST', '/battles/' + b.id + '/' + path, session, body); if (okText) G.toast(okText); await drawList(); } catch (err) { msg.textContent = problem(err); }
                }
                if (b.can_respond) {
                    const yes = small(el('button', 'pg-btn', 'Qabul qilish')); yes.type = 'button';
                    const no = small(el('button', 'pg-btn danger', 'Rad etish')); no.type = 'button';
                    yes.addEventListener('click', function () { call('respond', { accept: true }, 'Chaqiriq qabul qilindi'); });
                    twice(no, 'Aniqmi?', function () { return call('respond', { accept: false }, 'Chaqiriq rad etildi'); });
                    acts.appendChild(yes); acts.appendChild(no);
                }
                if (b.is_host_admin && b.status === 'invited') {
                    const go = small(el('button', 'pg-btn', 'Boshlash')); go.type = 'button';
                    go.addEventListener('click', function () {
                        go.disabled = true; msg.textContent = b.kind === 'quiz' ? 'Savollar tayyorlanmoqda…' : '';
                        call('start', {}, "Battle boshlandi. A'zolarga xabar yuborildi").then(function () { go.disabled = false; });
                    });
                    const stop = small(el('button', 'pg-btn ghost', 'Bekor qilish')); stop.type = 'button';
                    twice(stop, 'Aniqmi?', function () { return call('cancel', {}, 'Battle bekor qilindi'); });
                    acts.appendChild(go); acts.appendChild(stop);
                }
                if (b.status === 'finished' && b.teams.some(function (x) { return x.result; })) row.appendChild(resultTable(b));
                if (b.appeal) {
                    const AP = { open: "E'tirozingiz ko'rib chiqilmoqda", accepted: "E'tirozingiz qabul qilindi", rejected: "E'tirozingiz rad etildi" };
                    const ap = el('p', 'pg-muted', (AP[b.appeal.status] || "E'tiroz yuborilgan") + (b.appeal.note ? ': ' + b.appeal.note : ''));
                    row.appendChild(ap);
                }
                if (b.can_appeal) {
                    const af = el('form', 'pg-card'); af.noValidate = true; af.hidden = true; af.appendChild(el('h4', 'pg-h3', "Natijaga e'tiroz"));
                    const why = el('textarea', 'pg-input'); why.maxLength = 500; why.rows = 3; why.placeholder = "Nima uchun natija noto'g'ri deb o'ylaysiz? (kamida 10 ta belgi)"; why.setAttribute('aria-label', "E'tiroz sababi");
                    const am = note(); const ab = small(el('button', 'pg-btn', 'Yuborish')); ab.type = 'submit';
                    af.appendChild(why); af.appendChild(ab); af.appendChild(am);
                    af.appendChild(el('p', 'pg-muted', "Har bir battle uchun bitta e'tiroz. Platforma admini ko'rib chiqadi."));
                    af.addEventListener('submit', async function (e) {
                        e.preventDefault(); am.textContent = ''; ab.disabled = true;
                        try { await send('POST', '/battles/' + b.id + '/appeal', session, { reason: why.value }); G.toast("E'tiroz yuborildi"); await drawList(); } catch (err) { am.textContent = problem(err); ab.disabled = false; }
                    });
                    const ao = small(el('button', 'pg-btn ghost', "E'tiroz bildirish")); ao.type = 'button';
                    ao.addEventListener('click', function () { af.hidden = !af.hidden; if (!af.hidden) why.focus(); });
                    acts.appendChild(ao); row.appendChild(af);
                }
                if (b.can_submit) {
                    const mine = b.teams.find(function (t) { return t.team_id === b.my_team_id; });
                    const f = el('form', 'pg-card'); f.noValidate = true; f.appendChild(el('h4', 'pg-h3', 'Loyihani topshirish'));
                    const link = el('input', 'pg-input'); link.type = 'url'; link.maxLength = 300; link.placeholder = 'https://github.com/jamoa/loyiha'; link.setAttribute('aria-label', 'Loyiha havolasi');
                    const nt = el('textarea', 'pg-input'); nt.maxLength = 500; nt.rows = 2; nt.placeholder = 'Qisqa izoh (ixtiyoriy)'; nt.setAttribute('aria-label', 'Izoh');
                    if (mine && mine.submission) { link.value = mine.submission.link; nt.value = mine.submission.note || ''; }
                    const sm = note(); const sb = small(el('button', 'pg-btn', mine && mine.submission ? 'Yangilash' : 'Topshirish')); sb.type = 'submit';
                    f.appendChild(link); f.appendChild(nt); f.appendChild(sb); f.appendChild(sm);
                    f.appendChild(el('p', 'pg-muted', "Vaqt tugaguncha havolani almashtirish mumkin. Raqiblar ishingizni battle tugamaguncha ko'rmaydi."));
                    f.addEventListener('submit', async function (e) {
                        e.preventDefault(); sm.textContent = ''; sb.disabled = true;
                        try { await send('POST', '/battles/' + b.id + '/submit', session, { link: link.value, note: nt.value }); G.toast('Loyiha topshirildi'); await drawList(); } catch (err) { sm.textContent = problem(err); sb.disabled = false; }
                    });
                    row.appendChild(f);
                }
                if (b.kind === 'quiz' && b.my_team_id && (b.status === 'active' || b.status === 'finished')) {
                    const slot = el('div'); const open = small(el('button', 'pg-btn', b.status === 'finished' ? "Javoblarni ko'rish" : 'Viktorinaga kirish')); open.type = 'button';
                    open.addEventListener('click', async function () {
                        if (slot.firstChild) { slot.textContent = ''; return; }
                        slot.appendChild(await quizPane(session, b, function () { slot.textContent = ''; drawList(); }));
                    });
                    acts.appendChild(open); row.appendChild(slot);
                }
                row.appendChild(acts); row.appendChild(msg); listBody.appendChild(row);
            });
        }

        // The challenge form: only for admins
        if (mineAdmin.length) {
            const form = el('form', 'pg-card'); form.noValidate = true; form.appendChild(el('h3', 'pg-h3', 'Battlega chorlash'));
            const host = el('select', 'pg-input'); mineAdmin.forEach(function (t) { const o = el('option', '', t.name); o.value = t.id; host.appendChild(o); });
            const title = el('input', 'pg-input'); title.type = 'text'; title.maxLength = 100; title.placeholder = 'Masalan: Python bellashuvi';
            const topic = el('input', 'pg-input'); topic.type = 'text'; topic.maxLength = 200; topic.placeholder = 'Masalan: Python asoslari';
            const kind = el('select', 'pg-input'); Object.keys(KIND_TEXT).forEach(function (k) { const o = el('option', '', KIND_TEXT[k]); o.value = k; kind.appendChild(o); });
            const days = el('select', 'pg-input'); for (let d = 1; d <= 7; d++) { const o = el('option', '', d + ' kun'); o.value = String(d); days.appendChild(o); }
            days.value = '2';
            form.appendChild(field('Sizning jamoangiz', host, 'tbHost')); form.appendChild(field('Nomi', title, 'tbTitle')); form.appendChild(field('Mavzu', topic, 'tbTopic'));
            form.appendChild(field('Turi', kind, 'tbKind')); form.appendChild(field('Davomiyligi', days, 'tbDays'));
            const oppBox = el('div'); oppBox.style.cssText = 'display:grid;gap:6px;max-height:220px;overflow-y:auto;padding:4px 0';
            const picked = new Set();
            function drawOpp() {
                oppBox.textContent = '';
                teams.filter(function (t) { return String(t.id) !== host.value; }).forEach(function (t) {
                    const lab = el('label', 'pg-muted'); lab.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer';
                    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = t.id; cb.checked = picked.has(t.id);
                    cb.addEventListener('change', function () { if (cb.checked) picked.add(t.id); else picked.delete(t.id); });
                    lab.appendChild(cb); lab.appendChild(document.createTextNode(t.name + ' (' + t.members + " a'zo)")); oppBox.appendChild(lab);
                });
                if (!oppBox.children.length) oppBox.appendChild(empty("Boshqa jamoa yo'q."));
            }
            host.addEventListener('change', function () { picked.delete(Number(host.value)); drawOpp(); });
            drawOpp();
            const oppField = el('div'); oppField.appendChild(el('div', 'pg-muted', 'Raqib jamoalar (1–5 ta)')); oppField.appendChild(oppBox); form.appendChild(oppField);
            form.appendChild(el('p', 'pg-muted', "Har bir jamoada kamida 3 ta faol a'zo bo'lishi kerak. Savollarni raqib emas, tizim tayyorlaydi."));
            const msg = note(); form.appendChild(msg);
            const go = el('button', 'pg-btn', 'Chorlash'); go.type = 'submit'; form.appendChild(go);
            form.addEventListener('submit', async function (e) {
                e.preventDefault(); msg.textContent = '';
                if (!title.value.trim() || !topic.value.trim()) { msg.textContent = "Nom va mavzuni kiriting."; return; }
                if (!picked.size) { msg.textContent = 'Kamida bitta raqib jamoani tanlang.'; return; }
                go.disabled = true;
                try {
                    await send('POST', '/battles', session, { host_team_id: Number(host.value), title: title.value, topic: topic.value, kind: kind.value, duration_days: Number(days.value), opponent_team_ids: Array.from(picked) });
                    title.value = ''; topic.value = ''; picked.clear(); drawOpp(); G.toast('Chaqiriq yuborildi'); await drawList();
                } catch (err) { msg.textContent = problem(err); }
                go.disabled = false;
            });
            box.appendChild(form);
            // Used by the teams list: picks this team as the only opponent and brings the form into view
            box.challenge = function (teamId) {
                const mine = mineAdmin.find(function (t) { return t.id !== teamId; });
                if (!mine) return;
                host.value = String(mine.id); picked.clear(); picked.add(teamId); drawOpp();
                if (form.scrollIntoView) form.scrollIntoView({ block: 'start', behavior: 'smooth' });
                title.focus();
            };
        } else {
            box.appendChild(empty("Battlega chorlash uchun jamoa admini bo'lishingiz kerak. Javob berish uchun esa jamoangiz chaqirilishi kutiladi."));
        }
        box.appendChild(listCard);
        await drawList();
        const board = await leaderboardCard(session); if (board) box.appendChild(board);
        return box;
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
        if (team.rank) pills.appendChild(el('span', 'pg-pill sun', '#' + team.rank + ' reyting'));
        pills.appendChild(el('span', 'pg-pill' + (team.recruiting ? '' : ' sun'), team.recruiting ? 'Qabul qilmoqda' : 'Yopiq'));
        if (team.is_captain && team.pending_requests > 0) pills.appendChild(el('span', 'pg-pill sun', team.pending_requests + " ta yangi so'rov"));
        c.appendChild(pills);
        const h = el('h3', '', team.name); h.style.marginTop = '10px'; c.appendChild(h);
        if (team.sphere) c.appendChild(el('p', 'pg-muted', 'Soha: ' + team.sphere));
        const first = goalLines(team.goals)[0];
        if (first) { const g = el('p', 'pg-muted', 'Maqsad: ' + (first.length > 120 ? first.slice(0, 117) + '...' : first)); g.style.margin = '6px 0 0'; c.appendChild(g); }
        const meta = el('div', 'pg-meta'); meta.style.cssText = 'justify-content:flex-start;gap:4px 16px';
        [[team.members + " a'zo"], ['Bu hafta: ' + ((team.activity && team.activity.writers) || 0) + ' faol'], ['Ball: ' + (team.rating || 0)], ['Ochgan: ' + (team.captain_name || '–')], ['Sana: ' + dateText(team.created_at)]].forEach(function (x) { meta.appendChild(el('span', '', x[0])); });
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
            if (!team.my_status && !team.is_captain) {
                if (team.recruiting) { const j = joinControls(team, session, redraw); act.appendChild(j.button); hide = j.label; }
                else act.appendChild(el('span', 'pg-muted', "Hozir a'zo qabul qilinmaydi"));
            }
        }
        c.appendChild(act);
        if (hide) { hide.style.marginTop = '10px'; c.appendChild(hide); }
        return c;
    }

    // ---------------- Teams list, my teams, open a team ----------------
    G.register('jamoalar', async function (root, session) {
        let tab = G.ctx.teamsTab || 'all'; G.ctx.teamsTab = null;
        let filter = 'all', query = '', sortBy = 'rating', onlyOpen = false;

        async function draw() {
            const data = await get('/teams', session);
            const teams = data.teams; const directions = data.directions || [];
            const limits = data.limits || { maxTeamsPerUser: 5, maxMembers: 100 };
            const pg = page(root);
            pg.appendChild(head('Jamoalar', "Birga o'rganing, chatda fikr almashing, bir-biringizga yordam bering. Jamoa ochish va qatnashish tekin."));

            const names = [['all', 'Barcha jamoalar'], ['foryou', 'Siz uchun'], ['top', 'Reyting'], ['mine', 'Mening jamoalarim'], ['create', 'Jamoa ochish']];
            const panes = {};
            tabs.onChange = function (k) { tab = k; };
            const nav = tabs(names, tab, panes); nav.classList.add('pg-tabs-wrap'); pg.appendChild(nav);

            // --- all teams, with direction filter
            const all = el('div'); all.hidden = tab !== 'all'; all.dataset.pane = 'all'; panes.all = all;
            const chips = el('div', 'pg-chips'); const grid = el('div', 'pg-grid');
            const tools = el('div', 'pg-tools');
            const search = el('input', 'pg-input'); search.type = 'search'; search.placeholder = 'Jamoa qidirish'; search.maxLength = 100; search.value = query; search.setAttribute('aria-label', 'Jamoa qidirish');
            const sortSel = el('select', 'pg-input'); sortSel.setAttribute('aria-label', 'Saralash');
            [['rating', 'Reyting bo\'yicha'], ['new', 'Yangilari'], ['members', "A'zolar soni"]].forEach(function (x) { const o = el('option', '', x[1]); o.value = x[0]; sortSel.appendChild(o); });
            sortSel.value = sortBy;
            const openLab = el('label', 'pg-muted'); openLab.style.cssText = 'display:inline-flex;align-items:center;gap:6px;cursor:pointer';
            const openCb = document.createElement('input'); openCb.type = 'checkbox'; openCb.checked = onlyOpen; openLab.appendChild(openCb); openLab.appendChild(document.createTextNode('Qabul qilayotganlar'));
            tools.appendChild(search); tools.appendChild(sortSel); tools.appendChild(openLab);
            function fill() {
                grid.textContent = '';
                const q = query.trim().toLowerCase();
                const list = teams.filter(function (t) {
                    if (filter !== 'all' && t.direction !== filter) return false;
                    if (onlyOpen && !t.recruiting) return false;
                    return !q || [t.name, t.description, t.sphere, t.goals].some(function (v) { return String(v || '').toLowerCase().indexOf(q) !== -1; });
                });
                list.sort(function (a, b) {
                    if (sortBy === 'new') return String(b.created_at).localeCompare(String(a.created_at));
                    if (sortBy === 'members') return b.members - a.members;
                    return (b.rating || 0) - (a.rating || 0) || b.members - a.members;
                });
                if (!list.length) { grid.appendChild(empty(teams.length ? 'Hech narsa topilmadi.' : 'Hali jamoa ochilmagan. Birinchi bo\'ling: "Jamoa ochish" bo\'limidan boshlang.')); return; }
                list.forEach(function (t) { grid.appendChild(teamCard(t, session, draw)); });
            }
            [['all', 'Hammasi']].concat(directions.map(function (d) { return [d, d]; })).forEach(function (d) {
                const c = el('button', 'pg-chip' + (d[0] === filter ? ' on' : ''), d[1]); c.type = 'button';
                c.addEventListener('click', function () {
                    filter = d[0]; chips.querySelectorAll('.pg-chip').forEach(function (x) { x.classList.toggle('on', x === c); }); fill();
                });
                chips.appendChild(c);
            });
            search.addEventListener('input', function () { query = search.value; fill(); });
            sortSel.addEventListener('change', function () { sortBy = sortSel.value; fill(); });
            openCb.addEventListener('change', function () { onlyOpen = openCb.checked; fill(); });
            all.appendChild(tools); all.appendChild(chips); all.appendChild(grid); fill(); pg.appendChild(all);
            all.appendChild(el('p', 'pg-muted', "Jamoaga qo'shilish uchun so'rov yuboriladi. Jamoa admini uni qabul qiladi yoki rad etadi."));

            // --- for you: pick interests, see matching teams that take people
            const fy = el('div'); fy.hidden = tab !== 'foryou'; fy.dataset.pane = 'foryou'; panes.foryou = fy;
            const fyBox = card("Qiziqishlaringiz"); fyBox.appendChild(el('p', 'pg-muted', "Yo'nalishlarni tanlang. Sizga mos, a'zo qabul qilayotgan jamoalarni ko'rsatamiz."));
            const fyChips = el('div', 'pg-chips'); const fyMsg = note(); const fyGrid = el('div', 'pg-grid'); fyGrid.style.marginTop = '14px';
            let mineDirs = [];
            async function fyFill() {
                fyGrid.textContent = '';
                try {
                    const r = await get('/teams/recommended', session);
                    if (r.needs_interests) { fyGrid.appendChild(empty("Yuqoridan kamida bitta yo'nalishni tanlang.")); return; }
                    if (!r.teams.length) { fyGrid.appendChild(empty("Hozircha mos jamoa yo'q. Boshqa yo'nalish tanlang yoki o'zingiz jamoa oching.")); return; }
                    r.teams.forEach(function (t) {
                        const c = teamCard(t, session, draw);
                        c.appendChild(el('p', 'pg-muted', "Siz tanlagan yo'nalish: " + t.direction));
                        fyGrid.appendChild(c);
                    });
                } catch (err) { fyMsg.textContent = problem(err); }
            }
            directions.forEach(function (d) {
                const c = el('button', 'pg-chip', d); c.type = 'button'; c.dataset.dir = d; c.setAttribute('aria-pressed', 'false');
                c.addEventListener('click', async function () {
                    const next = mineDirs.indexOf(d) === -1 ? mineDirs.concat(d) : mineDirs.filter(function (x) { return x !== d; });
                    fyMsg.textContent = '';
                    try {
                        const r = await send('PUT', '/teams/interests', session, { directions: next });
                        mineDirs = r.interests || next;
                        fyChips.querySelectorAll('.pg-chip').forEach(function (x) { const on = mineDirs.indexOf(x.dataset.dir) !== -1; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
                        await fyFill();
                    } catch (err) { fyMsg.textContent = problem(err); }
                });
                fyChips.appendChild(c);
            });
            fyBox.appendChild(fyChips); fyBox.appendChild(fyMsg); fy.appendChild(fyBox); fy.appendChild(fyGrid); pg.appendChild(fy);
            try {
                mineDirs = (await get('/teams/interests', session)).interests || [];
                fyChips.querySelectorAll('.pg-chip').forEach(function (x) { const on = mineDirs.indexOf(x.dataset.dir) !== -1; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
            } catch (err) { fyMsg.textContent = problem(err); }
            await fyFill();

            // --- leaderboard: last 7 days of real chat activity
            const top = el('div'); top.hidden = tab !== 'top'; top.dataset.pane = 'top'; panes.top = top;
            const board = card('Haftalik reyting');
            board.appendChild(el('p', 'pg-muted', "Oxirgi 7 kun: chatda yozgan har bir a'zo 5 ball, xabarlar esa har kishidan ko'pi bilan 20 ta hisoblanadi."));
            const ranked = teams.filter(function (t) { return t.rank; }).sort(function (a, b) { return a.rank - b.rank; }).slice(0, 20);
            if (!ranked.length) board.appendChild(empty("Bu hafta hali faollik yo'q. Chatda yozing, jamoangiz reytingga chiqadi."));
            ranked.forEach(function (t) {
                const row = el('div', 'pg-row'); row.style.cursor = 'pointer';
                if (t.is_captain || t.my_status === 'active') row.style.fontWeight = '700';
                const left = el('div'); left.appendChild(el('b', '', '#' + t.rank + ' ' + t.name)); left.appendChild(el('span', 'pg-muted', ' ' + (t.direction || '') + ' · ' + t.members + " a'zo · " + ((t.activity && t.activity.writers) || 0) + ' faol'));
                row.appendChild(left); row.appendChild(el('b', '', t.rating + ' ball'));
                row.addEventListener('click', function () { openTeam(t); });
                board.appendChild(row);
            });
            top.appendChild(board); pg.appendChild(top);

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
    // The list of teams inside Competitions: pick one and send a battle request
    function rivalsPane(teams, canChallenge, challenge) {
        const wrap = el('div'); wrap.style.cssText = 'display:grid;gap:14px';
        const search = el('input', 'pg-input'); search.type = 'search'; search.maxLength = 100; search.placeholder = 'Jamoa qidirish'; search.setAttribute('aria-label', 'Jamoa qidirish');
        wrap.appendChild(search);
        if (!canChallenge.length) wrap.appendChild(el('p', 'pg-muted', "Battlega chorlash uchun jamoa admini bo'lishingiz kerak. Jamoalarni bu yerda ko'rishingiz mumkin."));
        const grid = el('div', 'pg-grid'); wrap.appendChild(grid);
        function draw() {
            grid.textContent = '';
            const q = search.value.trim().toLowerCase();
            const list = teams.filter(function (t) { return !q || t.name.toLowerCase().indexOf(q) !== -1 || String(t.direction || '').toLowerCase().indexOf(q) !== -1; })
                .sort(function (a, b) { return (b.rating || 0) - (a.rating || 0) || b.members - a.members; });
            if (!list.length) { grid.appendChild(empty(teams.length ? 'Hech narsa topilmadi.' : "Hozircha jamoa yo'q.")); return; }
            list.forEach(function (t) {
                const c = el('div', 'pg-card'); c.dataset.team = String(t.id);
                c.appendChild(el('h3', 'pg-h3', t.name));
                c.appendChild(el('p', 'pg-muted', (t.direction || 'Boshqa') + ' · ' + t.members + " a'zo · " + (t.rating || 0) + ' ball'));
                const own = !canChallenge.some(function (m) { return m.id !== t.id; });
                const few = t.members < BATTLE_MIN_MEMBERS;
                const b = small(el('button', 'pg-btn', 'Battlega chorlash')); b.type = 'button';
                let why = '';
                if (!canChallenge.length) why = '';
                else if (own) why = 'Bu sizning jamoangiz';
                else if (few) why = "Faol a'zolar yetarli emas (kamida " + BATTLE_MIN_MEMBERS + ')';
                if (!canChallenge.length || why) { b.disabled = true; b.style.opacity = '.45'; b.style.cursor = 'not-allowed'; }
                else b.addEventListener('click', function () { challenge(t.id); });
                c.appendChild(b); if (why) c.appendChild(el('p', 'pg-muted', why));
                grid.appendChild(c);
            });
        }
        search.addEventListener('input', draw); draw();
        return wrap;
    }

    // ---- Seasonal tournaments: register a team, see the groups and the fixture list
    const TOURNAMENT_STATUS = { open: "Ro'yxatdan o'tish ochiq", groups: 'Guruh bosqichi', playoffs: 'Pley-off', finished: 'Tugagan' };
    const STAGE_NAME = { quarter: 'Chorak final', semi: 'Yarim final', final: 'Final' };
    function scoreText(n) { return String(Math.round(n * 100) / 100); }
    function fixtureList(t, goBattles) {
        const wrap = el('div'); wrap.style.cssText = 'display:grid;gap:10px;margin-top:10px';
        (t.groups || []).forEach(function (g) {
            const c = el('div', 'pg-card'); c.dataset.group = String(g.group_no);
            c.appendChild(el('h4', 'pg-h3', String.fromCharCode(64 + g.group_no) + ' guruhi'));
            const tb = el('table', 'pg-table'); const hr = el('tr');
            ['#', 'Jamoa', "O'", 'G', 'D', 'M', 'Ball', 'Farq'].forEach(function (h) { hr.appendChild(el('th', '', h)); }); tb.appendChild(hr);
            g.table.forEach(function (r) {
                const tr = el('tr'); [r.rank, r.name, r.played, r.won, r.drawn, r.lost, r.points, scoreText(r.diff)].forEach(function (v) { tr.appendChild(el('td', '', String(v))); }); tb.appendChild(tr);
            });
            c.appendChild(tb);
            const rounds = {}; t.matches.filter(function (m) { return m.stage === 'group' && m.group_no === g.group_no; }).forEach(function (m) { (rounds[m.round_no] = rounds[m.round_no] || []).push(m); });
            Object.keys(rounds).sort().forEach(function (r) {
                const line = rounds[r].map(function (m) {
                    if (m.state === 'finished') return m.name_a + ' ' + scoreText(m.score_a) + ' : ' + scoreText(m.score_b) + ' ' + m.name_b;
                    return m.name_a + ' — ' + m.name_b + (m.state === 'waiting' ? '' : m.state === 'judging' ? " (baholanmoqda)" : " (o'ynalmoqda)");
                }).join(' · ');
                c.appendChild(el('p', 'pg-muted', r + '-tur: ' + line));
            });
            wrap.appendChild(c);
        });
        if (t.champion) {
            const ch = el('div', 'pg-card'); ch.dataset.champion = String(t.champion.team_id);
            ch.appendChild(el('h4', 'pg-h3', '🏆 Chempion: ' + t.champion.name));
            wrap.insertBefore(ch, wrap.firstChild);
        }
        ['quarter', 'semi', 'final'].forEach(function (st) {
            const ms = t.matches.filter(function (m) { return m.stage === st; });
            if (!ms.length) return;
            const c = el('div', 'pg-card'); c.dataset.stage = st;
            c.appendChild(el('h4', 'pg-h3', STAGE_NAME[st]));
            ms.forEach(function (m) {
                let line;
                if (m.state === 'finished') line = m.name_a + ' ' + scoreText(m.score_a) + ' : ' + scoreText(m.score_b) + ' ' + m.name_b + ' → ' + (m.winner === m.team_a ? m.name_a : m.name_b);
                else line = m.name_a + ' — ' + m.name_b + (m.state === 'judging' ? ' (baholanmoqda)' : " (o'ynalmoqda)");
                c.appendChild(el('p', 'pg-muted', line));
            });
            wrap.appendChild(c);
        });
        if (goBattles && t.matches.some(function (m) { return m.state === 'active'; })) {
            const go = small(el('button', 'pg-btn', "O'ynash: Battlelar")); go.type = 'button'; go.addEventListener('click', goBattles); wrap.appendChild(go);
        }
        if (t.groups_finished && !t.playoff_stage) wrap.appendChild(el('p', 'pg-muted', "Guruh bosqichi tugadi. Pley-off admin boshlaganda e'lon qilinadi."));
        else if (t.playoff_stage && !t.champion) wrap.appendChild(el('p', 'pg-muted', "Pley-off davom etmoqda. Durang bo'lsa, guruhda yuqori o'rin olgan jamoa o'tadi."));
        else if (t.next_round) wrap.appendChild(el('p', 'pg-muted', t.next_round + "-tur o'yinlari admin boshlaganda ochiladi. Har tur " + t.round_days + ' kun davom etadi.'));
        return wrap;
    }
    async function tournamentsPane(session, goBattles) {
        const box = el('div'); box.style.cssText = 'display:grid;gap:14px';
        let data;
        try { data = await get('/tournaments', session); } catch (err) { box.appendChild(empty(problem(err))); return box; }
        data.tournaments = data.tournaments || []; data.my_admin_teams = data.my_admin_teams || [];
        data.tournaments.forEach(function (t) {
            const c = el('div', 'pg-card'); c.dataset.tournament = String(t.id);
            const top = el('div'); top.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between';
            top.appendChild(el('h3', 'pg-h3', t.title)); top.appendChild(el('span', 'pg-pill sun', TOURNAMENT_STATUS[t.status] || t.status)); c.appendChild(top);
            c.appendChild(el('p', 'pg-muted', 'Mavzu: ' + t.topic + ' · Har tur ' + t.round_days + ' kun · Jamoalar: ' + t.teams.length));
            const msg = note();
            if (t.status === 'open') {
                const reg = {}; t.teams.forEach(function (x) { reg[x.team_id] = true; });
                t.teams.forEach(function (x) {
                    const row = el('div', 'pg-muted', x.name);
                    if (x.mine) {
                        const out = small(el('button', 'pg-btn ghost', 'Chiqarish')); out.type = 'button'; out.style.marginLeft = '8px';
                        out.addEventListener('click', async function () { try { await send('POST', '/tournaments/' + t.id + '/withdraw', session, { team_id: x.team_id }); G.toast('Jamoa ro\'yxatdan chiqarildi'); await redraw(); } catch (err) { msg.textContent = problem(err); } });
                        row.appendChild(out);
                    }
                    c.appendChild(row);
                });
                const free = data.my_admin_teams.filter(function (m) { return !reg[m.id]; });
                if (free.length) {
                    const f = el('form'); f.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px'; f.noValidate = true;
                    const sel = el('select', 'pg-input'); sel.style.maxWidth = '260px'; sel.setAttribute('aria-label', 'Jamoa');
                    free.forEach(function (m) { const o = el('option', '', m.name + ' (' + m.members + " a'zo)"); o.value = m.id; sel.appendChild(o); });
                    const go = small(el('button', 'pg-btn', "Ro'yxatdan o'tkazish")); go.type = 'submit';
                    f.appendChild(sel); f.appendChild(go); c.appendChild(f);
                    f.addEventListener('submit', async function (e) {
                        e.preventDefault(); msg.textContent = ''; go.disabled = true;
                        try { await send('POST', '/tournaments/' + t.id + '/register', session, { team_id: Number(sel.value) }); G.toast("Jamoa ro'yxatdan o'tdi"); await redraw(); } catch (err) { msg.textContent = problem(err); go.disabled = false; }
                    });
                } else if (!data.my_admin_teams.length) c.appendChild(el('p', 'pg-muted', "Ro'yxatdan o'tkazish uchun jamoa admini bo'lishingiz kerak."));
                c.appendChild(el('p', 'pg-muted', "Platforma guruhlarni reyting bo'yicha qura tashlaydi. Guruhda har bir jamoa boshqalar bilan o'ynaydi."));
            } else c.appendChild(fixtureList(t, goBattles));
            c.appendChild(msg); box.appendChild(c);
        });
        async function redraw() { const fresh = await tournamentsPane(session, goBattles); box.replaceWith(fresh); }
        if (!data.tournaments.length) {
            const c = card('Mavsumiy turnirlar: tez orada');
            c.appendChild(el('p', 'pg-muted', "Platforma o'zi o'tkazadigan katta musobaqa. Futbol jahon chempionati kabi saralanib boriladi."));
            [['1', "Jamoalar ro'yxatdan o'tadi"], ['2', "Reyting bo'yicha guruhlarga bo'linadi (3–4 jamoa)"], ['3', "Guruhda har kim har kim bilan o'ynaydi"], ['4', "Har guruhdan eng yaxshi 2 jamoa pley-offga o'tadi"], ['5', 'Yutgan davom etadi, chempion kubok oladi']].forEach(function (x) {
                const r = el('div'); r.style.cssText = 'display:flex;gap:10px;align-items:center;padding:6px 0'; r.appendChild(el('span', 'pg-pill', x[0])); r.appendChild(el('span', '', x[1])); c.appendChild(r);
            });
            c.appendChild(el('p', 'pg-muted', "Hozircha battlelarda reyting to'plang: u guruhlarga saralashda hisobga olinadi."));
            box.appendChild(c);
        }
        return box;
    }

    // ---- Rules: plain text, the same facts the server enforces
    const RULES = [
        ['Hisob qanday topiladi', ["Viktorina: jamoa balli = to'g'ri javoblar soni / faol o'yinchilar soni (eng kami 3 deb olinadi). Shuning uchun katta jamoa ham, kichik jamoa ham teng sharoitda.", "Har bir savolga bitta urinish. Javob berilgach, o'zgartirib bo'lmaydi.", "Loyiha battle: jamoa admini https havola topshiradi, hakam 0–100 ball qo'yadi."]],
        ['Halol o\'yin', ["Javoblarni o'zingiz toping. Boshqa jamoaga savol va javoblarni ko'rsatmang.", "Boshqa odamning nomidan o'ynamang. Bitta hisob bitta odamga tegishli.", "Raqiblarni hurmat qiling. Haqorat va tahdid taqiqlanadi.", "Loyiha battlelarda boshqa birovning ishini o'zinikidek topshirish taqiqlanadi."]],
        ["E'tiroz", ["Natija noto'g'ri deb hisoblasangiz, jamoa admini 48 soat ichida e'tiroz bildira oladi.", "Har bir jamoa bitta battleda faqat bitta e'tiroz yuboradi. Sababni aniq yozing (kamida 10 ta belgi).", "Platforma admini ko'rib chiqadi va javob yozadi. Javob sizga xabar sifatida keladi."]],
        ['Jazolar', ["Qoidabuzarlik aniqlansa, admin natijani bekor qilishi yoki jamoani musobaqadan chetlatishi mumkin.", "Takroriy qoidabuzarlikda jamoa yoki o'yinchi musobaqalarga qo'yilmaydi."]]
    ];
    function rulesPane() {
        const box = el('div');
        RULES.forEach(function (r) {
            const c = card(r[0]); const ul = el('ul'); ul.style.cssText = 'margin:0;padding-left:20px;display:grid;gap:6px';
            r[1].forEach(function (t) { ul.appendChild(el('li', '', t)); }); c.appendChild(ul); box.appendChild(c);
        });
        return box;
    }

    // ---- Competitions: its own section of the dashboard (battles now; seasonal tournaments are announced here)
    G.register('musobaqalar', async function (root, session) {
        let tab = G.ctx.compTab || 'battle'; G.ctx.compTab = null;
        async function draw() {
            const data = await get('/teams', session);
            const pg = page(root);
            pg.appendChild(head('Musobaqalar', "Jamoalar o'rtasida battle o'tkazing, reyting va kubok yuting."));
            const panes = {};
            tabs.onChange = function (k) { tab = k; };
            const nav = tabs([['battle', 'Battlelar'], ['teams', 'Jamoalar'], ['season', 'Mavsumiy turnirlar'], ['players', "O'yinchilar"], ['wheel', 'Baraban'], ['fame', 'Shon-sharaf'], ['rules', 'Qoidalar']], tab, panes); nav.classList.add('pg-tabs-wrap'); pg.appendChild(nav);

            const bt = el('div'); bt.hidden = tab !== 'battle'; bt.dataset.pane = 'battle'; panes.battle = bt;
            const battles = await battlesPane(session, data.teams, draw); bt.appendChild(battles); pg.appendChild(bt);

            const tm = el('div'); tm.hidden = tab !== 'teams'; tm.dataset.pane = 'teams'; panes.teams = tm;
            const adminOf = data.teams.filter(function (t) { return t.is_captain; });
            tm.appendChild(rivalsPane(data.teams, adminOf, function (id) { nav.querySelector('[data-tab="battle"]').click(); battles.challenge(id); }));
            pg.appendChild(tm);

            const se = el('div'); se.hidden = tab !== 'season'; se.dataset.pane = 'season'; panes.season = se;
            se.appendChild(await tournamentsPane(session, function () { nav.querySelector('[data-tab="battle"]').click(); })); pg.appendChild(se);

            const wh = el('div'); wh.hidden = tab !== 'wheel'; wh.dataset.pane = 'wheel'; panes.wheel = wh; wh.appendChild(window.GEWheel ? await window.GEWheel.pane(session, data.teams) : empty('Baraban hozircha mavjud emas.')); pg.appendChild(wh);

            const fm = el('div'); fm.hidden = tab !== 'fame'; fm.dataset.pane = 'fame'; panes.fame = fm; fm.appendChild(await famePane(session)); pg.appendChild(fm);

            const ru = el('div'); ru.hidden = tab !== 'rules'; ru.dataset.pane = 'rules'; panes.rules = ru; ru.appendChild(rulesPane()); pg.appendChild(ru);
            const pl = el('div'); pl.hidden = tab !== 'players'; pl.dataset.pane = 'players'; panes.players = pl;
            pl.appendChild(await playersPane(session)); pg.appendChild(pl);
        }
        await draw();
    });

    G.register('team-detail', async function (root, session) {
        const id = G.ctx.teamId;
        let tab = G.ctx.teamTab || null; G.ctx.teamTab = null;
        let chat = null;
        function toList(listTab) { if (chat) chat.stop(); G.ctx.teamsTab = listTab; G.open('jamoalar', 'jamoalar'); }
        function backButton() { const b = el('button', 'pg-btn ghost tt-back', '← Jamoalarga qaytish'); b.type = 'button'; b.setAttribute('aria-label', 'Jamoalarga qaytish'); b.addEventListener('click', function () { toList('all'); }); return b; }

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
            const keys = isMember ? ['chat', 'resources', 'events', 'members', 'about'].concat(isAdmin ? ['settings'] : []) : ['about', 'members'];
            if (!tab || keys.indexOf(tab) === -1) tab = isMember ? 'chat' : 'about';

            const pg = page(root);
            // Members get a fixed-height workspace: tabs and the chat on the left, team facts on the right
            // (on a phone the facts become a slim bar on top). Visitors keep the plain stacked page.
            let side = pg; let main = pg;
            if (isMember) {
                pg.classList.add('pg-team');
                const grid = el('div', 'tt-grid'); side = el('aside', 'tt-side'); main = el('div', 'tt-main');
                grid.appendChild(side); grid.appendChild(main); pg.appendChild(grid);
            }
            const bb = backButton(); if (!isMember) bb.style.marginBottom = '16px'; side.appendChild(bb);

            // Top: who it is
            const top = el('div', 'pg-card pg-file tt-id'); if (!isMember) top.style.marginBottom = '18px';
            top.appendChild(cover(team, 64));
            const d = el('div'); d.style.minWidth = '0'; const n = el('h2', '', team.name); n.style.margin = '0'; d.appendChild(n);
            const pills = el('div', 'tt-pills'); pills.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px';
            pills.appendChild(el('span', 'pg-pill', team.direction || 'Boshqa'));
            const st = statusPill(team); if (st) pills.appendChild(st);
            d.appendChild(pills);
            d.appendChild(el('div', 'tt-line pg-muted', (team.direction || 'Boshqa') + ' · ' + team.members + " a'zo · " + (team.rating || 0) + ' ball'));
            top.appendChild(d); side.appendChild(top);

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

            const factRows = [['Ochgan', team.captain_name || '–'], ['Ochilgan sana', dateText(team.created_at)], ["A'zolar soni", team.members + ' / ' + limits.maxMembers], ['Soha', team.sphere || '–'], ['Haftalik ball', String(team.rating || 0) + (team.rank ? ' (#' + team.rank + ')' : '')], ['Bu hafta', ((team.activity && team.activity.writers) || 0) + ' faol, ' + ((team.activity && team.activity.messages) || 0) + ' xabar'], ['Holat', team.recruiting ? 'A\'zo qabul qilmoqda' : 'Yopiq']];
            function factsNode(cls) {
                const facts = el('div', 'pg-grid ' + (cls || ''));
                factRows.forEach(function (f) {
                    const c = el('div', 'pg-card'); c.appendChild(el('div', 'pg-muted', f[0])); const v = el('b', '', f[1]); v.style.fontSize = '1.05rem'; c.appendChild(v); facts.appendChild(c);
                });
                return facts;
            }
            const facts = factsNode(isMember ? 'tt-facts' : ''); if (!isMember) facts.style.cssText = 'grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:18px';
            side.appendChild(facts);
            const rec = await recordCard(session, team.id); if (rec) side.appendChild(rec);

            const labels = { chat: 'Chat', resources: 'Resurslar', events: 'Tadbirlar', members: "A'zolar", about: 'Haqida', settings: 'Sozlamalar' };
            const panes = {};
            keys.forEach(function (k) { const p = el('div'); p.hidden = k !== tab; p.dataset.pane = k; panes[k] = p; });
            tabs.onChange = function (k) { tab = k; };
            main.appendChild(tabs(keys.map(function (k) { return [k, labels[k]]; }), tab, panes));
            keys.forEach(function (k) { main.appendChild(panes[k]); });

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

            // ---- Resources: links members share, best-voted first
            if (isMember) {
                const rp = panes.resources; rp.style.cssText = 'display:grid;gap:18px';
                const rform = el('form', 'pg-card'); rform.noValidate = true; rform.appendChild(el('h3', 'pg-h3', "Foydali havola qo'shish"));
                const rTitle = el('input', 'pg-input'); rTitle.type = 'text'; rTitle.maxLength = 150; rTitle.placeholder = 'Masalan: Python darslari';
                const rUrl = el('input', 'pg-input'); rUrl.type = 'url'; rUrl.maxLength = 500; rUrl.placeholder = 'https://...';
                const rNote = el('textarea', 'pg-input'); rNote.rows = 2; rNote.maxLength = 500; rNote.placeholder = 'Nima uchun foydali? (ixtiyoriy)';
                rform.appendChild(field('Sarlavha', rTitle, 'trTitle')); rform.appendChild(field('Havola', rUrl, 'trUrl')); rform.appendChild(field('Izoh', rNote, 'trNote'));
                const rMsg = note(); rform.appendChild(rMsg);
                const rAdd = el('button', 'pg-btn', "Qo'shish"); rAdd.type = 'submit'; rform.appendChild(rAdd);
                const rList = el('div', 'pg-card'); rList.appendChild(el('h3', 'pg-h3', 'Jamoa resurslari'));
                const rBody = el('div');
                async function rDraw() {
                    rBody.textContent = '';
                    let r;
                    try { r = await get('/teams/' + id + '/resources', session); } catch (err) { rBody.appendChild(empty(problem(err))); return; }
                    if (!r.resources.length) { rBody.appendChild(empty("Hali havola yo'q. Birinchi foydali havolani siz qo'shing.")); return; }
                    r.resources.forEach(function (x) {
                        const row = el('div', 'pg-row'); row.style.cssText = 'align-items:flex-start;gap:12px';
                        const vote = el('button', 'pg-btn' + (x.voted ? '' : ' ghost'), '▲ ' + x.votes); vote.type = 'button'; small(vote);
                        vote.setAttribute('aria-label', 'Ovoz berish'); vote.setAttribute('aria-pressed', String(x.voted)); vote.disabled = x.mine;
                        vote.addEventListener('click', async function () {
                            vote.disabled = true;
                            try { await send('POST', '/teams/' + id + '/resources/' + x.id + '/vote', session); await rDraw(); }
                            catch (err) { G.toast(problem(err)); vote.disabled = false; }
                        });
                        const mid = el('div'); mid.style.cssText = 'flex:1;min-width:0';
                        const a = el('a', '', x.title); a.rel = 'noopener noreferrer nofollow'; a.target = '_blank';
                        if (/^https?:\/\//i.test(x.url)) a.href = x.url;
                        a.style.cssText = 'font-weight:700;word-break:break-word';
                        mid.appendChild(a);
                        if (x.note) { const n = el('p', 'pg-muted', x.note); n.style.margin = '4px 0 0'; mid.appendChild(n); }
                        const by = el('p', 'pg-muted', "Qo'shgan: " + (x.added_by || '–') + ' · ' + dateText(x.created_at)); by.style.cssText = 'margin:4px 0 0;font-size:.85rem'; mid.appendChild(by);
                        row.appendChild(vote); row.appendChild(mid);
                        if (x.mine || isAdmin) {
                            const del = el('button', 'pg-btn ghost', "O'chirish"); del.type = 'button'; small(del);
                            twice(del, 'Aniqmi?', async function () {
                                try { await send('DELETE', '/teams/' + id + '/resources/' + x.id, session); await rDraw(); } catch (err) { G.toast(problem(err)); }
                            });
                            row.appendChild(del);
                        }
                        rBody.appendChild(row);
                    });
                }
                rform.addEventListener('submit', async function (e) {
                    e.preventDefault(); rMsg.textContent = '';
                    if (!rTitle.value.trim()) { rMsg.textContent = 'Sarlavhani kiriting.'; return; }
                    if (!/^https?:\/\/\S+$/i.test(rUrl.value.trim())) { rMsg.textContent = "Havola http:// yoki https:// bilan boshlansin."; return; }
                    rAdd.disabled = true;
                    try {
                        await send('POST', '/teams/' + id + '/resources', session, { title: rTitle.value, url: rUrl.value, note: rNote.value });
                        rTitle.value = ''; rUrl.value = ''; rNote.value = ''; G.toast("Havola qo'shildi"); await rDraw();
                    } catch (err) { rMsg.textContent = problem(err); }
                    rAdd.disabled = false;
                });
                rList.appendChild(rBody); rp.appendChild(rform); rp.appendChild(rList);
                await rDraw();
            }

            // ---- Events: the admin plans meetups, members say "Qatnashaman"
            if (isMember) {
                const ep = panes.events; ep.style.cssText = 'display:grid;gap:18px';
                const eList = el('div', 'pg-card'); eList.appendChild(el('h3', 'pg-h3', 'Yaqin uchrashuvlar'));
                const eBody = el('div');
                const when = (iso) => new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                async function eDraw() {
                    eBody.textContent = '';
                    let r;
                    try { r = await get('/teams/' + id + '/events', session); } catch (err) { eBody.appendChild(empty(problem(err))); return; }
                    if (!r.events.length) { eBody.appendChild(empty(isAdmin ? "Hali uchrashuv yo'q. Yuqoridan birinchisini rejalashtiring." : "Hali uchrashuv rejalashtirilmagan.")); return; }
                    r.events.forEach(function (x) {
                        const past = new Date(x.starts_at).getTime() < Date.now();
                        const row = el('div', 'pg-row'); row.style.cssText = 'align-items:flex-start;gap:12px;flex-wrap:wrap';
                        const mid = el('div'); mid.style.cssText = 'flex:1;min-width:200px';
                        mid.appendChild(el('b', '', x.title));
                        const meta = el('p', 'pg-muted', when(x.starts_at) + (x.place ? ' · ' + x.place : '') + (past ? " · O'tgan" : '')); meta.style.margin = '4px 0 0'; mid.appendChild(meta);
                        if (x.note) { const n = el('p', 'pg-muted', x.note); n.style.margin = '4px 0 0'; mid.appendChild(n); }
                        const cnt = el('p', 'pg-muted', x.going + ' kishi qatnashadi'); cnt.style.cssText = 'margin:4px 0 0;font-size:.85rem'; mid.appendChild(cnt);
                        row.appendChild(mid);
                        if (!past) {
                            const go = el('button', 'pg-btn' + (x.i_go ? '' : ' ghost'), x.i_go ? '✓ Qatnashaman' : 'Qatnashaman'); go.type = 'button'; small(go); go.setAttribute('aria-pressed', String(x.i_go));
                            go.addEventListener('click', async function () {
                                go.disabled = true;
                                try { await send('POST', '/teams/' + id + '/events/' + x.id + '/going', session); await eDraw(); }
                                catch (err) { G.toast(problem(err)); go.disabled = false; }
                            });
                            row.appendChild(go);
                        }
                        if (isAdmin) {
                            const del = el('button', 'pg-btn ghost', "O'chirish"); del.type = 'button'; small(del);
                            twice(del, 'Aniqmi?', async function () {
                                try { await send('DELETE', '/teams/' + id + '/events/' + x.id, session); await eDraw(); } catch (err) { G.toast(problem(err)); }
                            });
                            row.appendChild(del);
                        }
                        eBody.appendChild(row);
                    });
                }
                if (isAdmin) {
                    const eform = el('form', 'pg-card'); eform.noValidate = true; eform.appendChild(el('h3', 'pg-h3', 'Uchrashuv rejalashtirish'));
                    const eTitle = el('input', 'pg-input'); eTitle.type = 'text'; eTitle.maxLength = 150; eTitle.placeholder = 'Masalan: Haftalik uchrashuv';
                    const eWhen = el('input', 'pg-input'); eWhen.type = 'datetime-local';
                    const ePlace = el('input', 'pg-input'); ePlace.type = 'text'; ePlace.maxLength = 200; ePlace.placeholder = 'Joy yoki onlayn havola (ixtiyoriy)';
                    const eNote = el('textarea', 'pg-input'); eNote.rows = 2; eNote.maxLength = 500; eNote.placeholder = 'Nimani muhokama qilamiz? (ixtiyoriy)';
                    eform.appendChild(field('Nomi', eTitle, 'teTitle')); eform.appendChild(field('Sana va vaqt', eWhen, 'teWhen')); eform.appendChild(field('Joy', ePlace, 'tePlace')); eform.appendChild(field('Izoh', eNote, 'teNote'));
                    const eMsg = note(); eform.appendChild(eMsg);
                    const eAdd = el('button', 'pg-btn', 'Rejalashtirish'); eAdd.type = 'submit'; eform.appendChild(eAdd);
                    eform.addEventListener('submit', async function (e) {
                        e.preventDefault(); eMsg.textContent = '';
                        if (!eTitle.value.trim()) { eMsg.textContent = 'Uchrashuv nomini kiriting.'; return; }
                        const at = new Date(eWhen.value);
                        if (!eWhen.value || Number.isNaN(at.getTime())) { eMsg.textContent = 'Sana va vaqtni tanlang.'; return; }
                        if (at.getTime() <= Date.now()) { eMsg.textContent = "Uchrashuv vaqti kelajakda bo'lsin."; return; }
                        eAdd.disabled = true;
                        try {
                            await send('POST', '/teams/' + id + '/events', session, { title: eTitle.value, place: ePlace.value, note: eNote.value, starts_at: at.toISOString() });
                            eTitle.value = ''; eWhen.value = ''; ePlace.value = ''; eNote.value = ''; G.toast("Uchrashuv rejalashtirildi. A'zolarga xabar yuborildi"); await eDraw();
                        } catch (err) { eMsg.textContent = problem(err); }
                        eAdd.disabled = false;
                    });
                    ep.appendChild(eform);
                }
                eList.appendChild(eBody); ep.appendChild(eList);
                await eDraw();
            }

            // ---- About
            const ap = panes.about; ap.style.cssText = 'display:grid;gap:18px';
            if (isMember) { const mf = factsNode('tt-facts-m'); mf.style.cssText = 'grid-template-columns:repeat(auto-fit,minmax(140px,1fr))'; ap.appendChild(mf); }
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
                const sRec = el('input'); sRec.type = 'checkbox'; sRec.id = 'tsRecruiting'; sRec.checked = !!team.recruiting;
                const recLab = el('label', 'pg-muted'); recLab.htmlFor = 'tsRecruiting'; recLab.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;margin:12px 0';
                recLab.appendChild(sRec); recLab.appendChild(document.createTextNode("Yangi a'zolarni qabul qilish (o'chirsangiz, so'rov yuborib bo'lmaydi)"));
                form.appendChild(recLab);
                const msg = note(); form.appendChild(msg);
                const save = el('button', 'pg-btn', 'Saqlash'); save.type = 'submit'; form.appendChild(save);
                form.addEventListener('submit', async function (e) {
                    e.preventDefault(); msg.textContent = '';
                    if (sName.value.trim().length < 2) { msg.textContent = 'Jamoa nomini kiriting.'; return; }
                    if (!sSphere.value.trim()) { msg.textContent = 'Sohani kiriting.'; return; }
                    if (!sGoals.value.trim()) { msg.textContent = 'Jamoa maqsadlarini yozing.'; return; }
                    save.disabled = true; save.textContent = 'Saqlanmoqda...';
                    try {
                        await send('PUT', '/teams/' + id, session, { name: sName.value, direction: sDir.value, sphere: sSphere.value, goals: sGoals.value, description: sDesc.value, invite_mode: sInvite.value, recruiting: sRec.checked });
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
