/* Admin battles page: the platform judge scores the projects teams handed in, then closes the battle.
   Real session only. Everything the teams wrote is set with textContent; links are clickable only when they are https. */
(function () {
    'use strict';
    function base() { return (window.config && window.config.apiBaseUrl) || '/api'; }
    function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

    async function call(method, path, token, body) {
        const headers = { Authorization: 'Bearer ' + token };
        const init = { method: method, headers: headers };
        if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
        const res = await fetch(base() + path, init);
        const out = await res.json().catch(function () { return {}; });
        if (res.status === 401 || res.status === 403) { const e = new Error('auth'); e.auth = true; throw e; }
        if (!res.ok) { const e = new Error(out.error || 'HTTP ' + res.status); e.status = res.status; throw e; }
        return out;
    }
    const STAGE_NAME = { quarter: 'Chorak final', semi: 'Yarim final', final: 'Final' };
    function say(m) {
        if (/Score every team/i.test(m)) return "Avval topshirgan har bir jamoani baholang.";
        if (/whole number/i.test(m)) return "Ball 0 dan 100 gacha butun son bo'lsin.";
        if (/AI that prepares/i.test(m)) return "Savollarni tayyorlovchi AI ulanmagan. Render Environment'da kalitni tekshiring.";
        if (/Could not prepare/i.test(m)) return "Savollarni tayyorlab bo'lmadi. Bir daqiqadan keyin qayta urining.";
        if (/previous round is not finished/i.test(m)) return "Oldingi tur hali tugamagan.";
        if (/rounds have already started/i.test(m)) return "Barcha turlar allaqachon boshlangan.";
        if (/group stage is not finished/i.test(m)) return "Guruh bosqichi hali tugamagan.";
        if (/previous stage is not finished/i.test(m)) return "Oldingi bosqich hali tugamagan.";
        if (/already started/i.test(m)) return "Bu bosqich allaqachon boshlangan.";
        if (/tournament is over/i.test(m)) return "Turnir tugagan.";
        if (/Groups need/i.test(m)) return "Guruh tuzish uchun 4, 6–8 yoki 12–16 jamoa kerak. Hozirgi sonni o'zgartiring.";
        if (/not possible in the current stage/i.test(m)) return "Bu qadam hozirgi bosqichda mumkin emas.";
        let q;
        if ((q = m.match(/A stage needs (\d+) to (\d+) questions/))) return 'Bosqichda ' + q[1] + ' tadan ' + q[2] + ' tagacha savol bo\'lishi kerak.';
        if ((q = m.match(/Question (\d+): the question text is empty/))) return q[1] + '-savol: matn bo\'sh.';
        if ((q = m.match(/Question (\d+): it needs exactly/))) return q[1] + '-savol: 4 ta variantning hammasini to\'ldiring.';
        if ((q = m.match(/Question (\d+): the options must be different/))) return q[1] + '-savol: variantlar bir-biridan farq qilsin.';
        if ((q = m.match(/Question (\d+): choose the correct/))) return q[1] + '-savol: to\'g\'ri variantni belgilang.';
        if ((q = m.match(/Question (\d+): .*too long/))) return q[1] + '-savol: matn juda uzun.';
        if (/Round length/i.test(m)) return "Tur davomiyligi 1–7 kun bo'lsin.";
        if (/already been answered/i.test(m)) return "Bu e'tirozga allaqachon javob berilgan.";
        if (/Note is required/i.test(m)) return "Javob izohini yozing.";
        if (/Note must be at most/i.test(m)) return "Izoh 300 belgidan oshmasin.";
        if (/Appeal not found/i.test(m)) return "E'tiroz topilmadi.";
        if (/must be 3 to 120/i.test(m)) return "Nom 3 dan 120 gacha belgi bo'lsin.";
        if (/A set needs \d+ to \d+ questions|A stage needs/i.test(m)) return "To'plamda 3 tadan 20 tagacha savol bo'lsin.";
        if (/already played and cannot be deleted/i.test(m)) return "Bu to'plam o'ynalgan, o'chirib bo'lmaydi.";
        if (/Question set not found/i.test(m)) return "To'plam topilmadi.";
        if (/not waiting for the judge/i.test(m)) return "Bu battle endi baholanmaydi.";
        return "Amalni bajarib bo'lmadi. Keyinroq urinib ko'ring.";
    }
    function linkNode(url) {
        if (!/^https:\/\//i.test(String(url))) return el('span', '', String(url));
        const a = el('a', '', String(url)); a.href = String(url); a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
    }

    // The admin writes the questions of one stage (own questions are used instead of the AI). Everything is set with textContent / .value.
    const SLOT_NAME = { quarter: 'Chorak final', semi: 'Yarim final', final: 'Final' };
    const slotLabel = function (k) { return SLOT_NAME[k] || k.slice(1) + '-tur'; };
    function questionBlock(x, prefix, onRemove) {
        const b = el('div'); b.style.cssText = 'border:1px solid var(--line,#8884);border-radius:10px;padding:10px;display:grid;gap:6px';
        const head = el('div'); head.style.cssText = 'display:flex;justify-content:space-between;align-items:center';
        const title = el('b', '', ''); const rm = el('button', 'pg-btn ghost', "O'chirish"); rm.type = 'button'; rm.style.padding = '4px 10px';
        head.appendChild(title); head.appendChild(rm); b.appendChild(head);
        const q = el('textarea', 'pg-input'); q.rows = 2; q.maxLength = 400; q.placeholder = 'Savol matni'; q.setAttribute('aria-label', 'Savol matni'); q.value = x.q || ''; b.appendChild(q);
        const name = 'ans-' + prefix + '-' + Math.random().toString(36).slice(2); const opts = []; const radios = [];
        for (let i = 0; i < 4; i++) {
            const row = el('label'); row.style.cssText = 'display:flex;gap:8px;align-items:center';
            const r = el('input'); r.type = 'radio'; r.name = name; r.checked = x.answer === i; r.setAttribute('aria-label', (i + 1) + '-variant to\'g\'ri');
            const o = el('input', 'pg-input'); o.type = 'text'; o.maxLength = 200; o.placeholder = (i + 1) + '-variant'; o.setAttribute('aria-label', (i + 1) + '-variant'); o.value = (x.options && x.options[i]) || ''; o.style.flex = '1';
            row.appendChild(r); row.appendChild(o); b.appendChild(row); opts.push(o); radios.push(r);
        }
        const ex = el('input', 'pg-input'); ex.type = 'text'; ex.maxLength = 300; ex.placeholder = 'Izoh (ixtiyoriy)'; ex.setAttribute('aria-label', 'Izoh'); ex.value = x.explanation || ''; b.appendChild(ex);
        const obj = { node: b, title: title, read: function () { const a = radios.findIndex(function (r) { return r.checked; }); return { q: q.value, options: opts.map(function (o) { return o.value; }), answer: a, explanation: ex.value }; } };
        rm.addEventListener('click', function () { b.remove(); onRemove(obj); });
        return obj;
    }

    // "Baraban" question sets: the platform admin writes them, team admins pick one to play
    function wheelSets(token, toast, onAuthError) {
        const box = el('div', 'pg-card'); box.dataset.wheel = 'sets';
        box.appendChild(el('h3', 'pg-h3', "Baraban savollari"));
        box.appendChild(el('p', 'pg-muted', "Jamoa adminlari shu to'plamlardan birini tanlab jonli o'yin boshlaydi. Savollar serverda saqlanadi, o'yinchi javobni ko'rmaydi."));
        const listBox = el('div'); listBox.style.cssText = 'display:grid;gap:8px;margin:10px 0';
        const title = el('input', 'pg-input'); title.type = 'text'; title.maxLength = 120; title.placeholder = "To'plam nomi (masalan: Moddiy oqimlar)"; title.setAttribute('aria-label', "To'plam nomi");
        const list = el('div'); list.style.cssText = 'display:grid;gap:12px;margin:10px 0';
        const bar = el('div'); bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        const msg = el('p', 'pg-muted'); msg.setAttribute('role', 'alert');
        let blocks = []; let limits = { min: 3, max: 20 };
        function renumber() { blocks.forEach(function (b, i) { b.title.textContent = (i + 1) + '-savol'; }); }
        function add() {
            if (blocks.length >= limits.max) { msg.textContent = "Eng ko'pi " + limits.max + ' ta savol.'; return; }
            const b = questionBlock({}, 'wheel', function (o) { blocks = blocks.filter(function (z) { return z !== o; }); renumber(); });
            blocks.push(b); list.appendChild(b.node); renumber();
        }
        async function load() {
            listBox.textContent = '';
            let r;
            try { r = await call('GET', '/admin/wheel-sets', token); } catch (e) { if (e.auth) { onAuthError(); return; } listBox.appendChild(el('p', 'pg-muted', "To'plamlarni yuklab bo'lmadi.")); return; }
            limits = r.limits || limits;
            if (!r.sets.length) listBox.appendChild(el('p', 'pg-muted', "Hozircha to'plam yo'q."));
            r.sets.forEach(function (x) {
                const row = el('div'); row.dataset.set = String(x.id); row.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap';
                row.appendChild(el('span', '', x.title + ' · ' + x.count + ' ta savol'));
                const del = el('button', 'pg-btn ghost', "O'chirish"); del.type = 'button'; del.style.padding = '4px 10px'; let sure = false;
                del.addEventListener('click', async function () {
                    msg.textContent = '';
                    if (!sure) { sure = true; del.textContent = 'Aniqmi? Qayta bosing'; setTimeout(function () { sure = false; del.textContent = "O'chirish"; }, 4000); return; }
                    try { await call('DELETE', '/admin/wheel-sets/' + x.id, token); toast("To'plam o'chirildi"); await load(); }
                    catch (err) { if (err.auth) { onAuthError(); return; } msg.textContent = say(String(err.message)); }
                });
                row.appendChild(del); listBox.appendChild(row);
            });
        }
        const addB = el('button', 'pg-btn ghost', "Savol qo'shish"); addB.type = 'button'; addB.addEventListener('click', add);
        const saveB = el('button', 'pg-btn', "To'plamni saqlash"); saveB.type = 'button';
        saveB.addEventListener('click', async function () {
            msg.textContent = ''; saveB.disabled = true;
            try {
                await call('POST', '/admin/wheel-sets', token, { title: title.value, questions: blocks.map(function (b) { return b.read(); }) });
                toast("To'plam saqlandi"); title.value = ''; list.textContent = ''; blocks = []; await load();
            } catch (err) { if (err.auth) { onAuthError(); return; } msg.textContent = say(String(err.message)); }
            saveB.disabled = false;
        });
        [addB, saveB].forEach(function (x) { bar.appendChild(x); });
        [listBox, el('h4', 'pg-h3', "Yangi to'plam"), title, list, bar, msg].forEach(function (x) { box.appendChild(x); });
        load();
        return box;
    }

    function questionEditor(t, token, toast, onAuthError) {
        const box = el('div', 'pg-card'); box.dataset.editor = String(t.id); box.style.marginTop = '10px';
        box.appendChild(el('h4', 'pg-h3', 'Savollar'));
        const info = el('p', 'pg-muted'); const msg = el('p', 'pg-muted'); msg.setAttribute('role', 'alert');
        const pick = el('select', 'pg-input'); pick.setAttribute('aria-label', 'Bosqich');
        const list = el('div'); list.style.cssText = 'display:grid;gap:12px;margin:10px 0';
        const bar = el('div'); bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        let data = { slots: {}, all_slots: [], limits: { min: 3, max: 20 } }; let blocks = [];

        function block(x) { return questionBlock(x, t.id, function (obj) { blocks = blocks.filter(function (z) { return z !== obj; }); renumber(); }); }
        function renumber() { blocks.forEach(function (b, i) { b.title.textContent = (i + 1) + '-savol'; }); info.textContent = blocks.length ? blocks.length + ' ta savol yozilgan.' : "Savol yo'q: bu bosqich uchun AI tuzadi."; }
        function show() {
            list.textContent = ''; blocks = [];
            (data.slots[pick.value] || []).forEach(function (x) { const b = block(x); blocks.push(b); list.appendChild(b.node); });
            renumber(); msg.textContent = '';
        }
        function add() { if (blocks.length >= data.limits.max) { msg.textContent = 'Eng ko\'pi ' + data.limits.max + ' ta savol.'; return; } const b = block({}); blocks.push(b); list.appendChild(b.node); renumber(); }
        async function save(clear) {
            msg.textContent = '';
            const questions = clear ? [] : blocks.map(function (b) { return b.read(); });
            try {
                await call('PUT', '/admin/tournaments/' + t.id + '/questions/' + pick.value, token, { questions: questions });
                data.slots[pick.value] = questions; if (!questions.length) delete data.slots[pick.value];
                toast(questions.length ? 'Savollar saqlandi' : 'Bosqich AI savollariga qaytdi'); show();
            } catch (err) { if (err.auth) { onAuthError(); return; } msg.textContent = say(String(err.message)); }
        }
        const addB = el('button', 'pg-btn ghost', "Savol qo'shish"); addB.type = 'button'; addB.addEventListener('click', add);
        const saveB = el('button', 'pg-btn', 'Saqlash'); saveB.type = 'button'; saveB.addEventListener('click', function () { save(false); });
        const clrB = el('button', 'pg-btn ghost', "O'z savollarini o'chirish (AI tuzsin)"); clrB.type = 'button'; clrB.addEventListener('click', function () { save(true); });
        [addB, saveB, clrB].forEach(function (x) { bar.appendChild(x); });
        pick.addEventListener('change', show);
        [pick, info, list, bar, msg].forEach(function (x) { box.appendChild(x); });
        call('GET', '/admin/tournaments/' + t.id + '/questions', token).then(function (r) {
            data = r; const slots = (r.all_slots || []).filter(function (k) { return !/^r\d+$/.test(k) || Number(k.slice(1)) <= Math.max(t.rounds_total || 0, 3); });
            slots.forEach(function (k) { const o = el('option', '', slotLabel(k) + (r.slots[k] ? ' · ' + r.slots[k].length + ' ta savol' : '')); o.value = k; pick.appendChild(o); });
            show();
        }).catch(function (e) { if (e.auth) { onAuthError(); return; } info.textContent = "Savollarni yuklab bo'lmadi."; });
        return box;
    }

    window.AdminBattles = {
        render: async function (root, token, onAuthError, toast) {
            root.textContent = '';
            const pg = el('div', 'pg'); root.appendChild(pg);
            const hd = el('div', 'pg-head'); const d = el('div');
            d.appendChild(el('h1', '', 'Battlelar va turnirlar'));
            d.appendChild(el('p', '', "Vaqti tugagan loyiha battlelari. Topshirilgan ishni ko'ring, 0–100 ball bering va yakunlang."));
            hd.appendChild(d); pg.appendChild(hd);
            const box = el('div'); box.style.cssText = 'display:grid;gap:16px'; pg.appendChild(box);
            const tbox = el('div'); tbox.style.cssText = 'display:grid;gap:16px;margin-top:24px'; pg.appendChild(tbox);

            const STATUS = { open: "Ro'yxatdan o'tish ochiq", groups: 'Guruh bosqichi', playoffs: 'Pley-off', finished: 'Tugagan' };
            const wbox = wheelSets(token, toast, onAuthError); wbox.style.marginTop = '24px'; pg.insertBefore(wbox, tbox);
            const abox = el('div'); abox.style.cssText = 'display:grid;gap:16px;margin-top:24px'; pg.insertBefore(abox, tbox);
            async function loadAppeals() {
                abox.textContent = '';
                abox.appendChild(el('h2', 'pg-h3', "E'tirozlar"));
                const msg = el('p', 'pg-muted'); msg.setAttribute('role', 'alert');
                let r;
                try { r = await call('GET', '/admin/appeals', token); } catch (e) { if (e.auth) { onAuthError(); return; } abox.appendChild(el('p', 'pg-muted', "E'tirozlarni yuklab bo'lmadi.")); return; }
                if (!r.appeals.length) abox.appendChild(el('div', 'pg-card', "Javob kutayotgan e'tiroz yo'q."));
                r.appeals.forEach(function (a) {
                    const c = el('div', 'pg-card'); c.dataset.appeal = String(a.id);
                    c.appendChild(el('h3', 'pg-h3', a.battle_title + ' · ' + a.team_name));
                    c.appendChild(el('p', 'pg-muted', 'Jamoa admini: ' + (a.captain_name || '—')));
                    c.appendChild(el('p', '', a.reason));
                    const nt = el('textarea', 'pg-input'); nt.maxLength = 300; nt.rows = 2; nt.placeholder = 'Javob izohi (majburiy)'; nt.setAttribute('aria-label', 'Javob izohi');
                    c.appendChild(nt);
                    const bar = el('div'); bar.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap';
                    [['accepted', 'Qabul qilish'], ['rejected', 'Rad etish']].forEach(function (d) {
                        const b = el('button', d[0] === 'accepted' ? 'pg-btn' : 'pg-btn ghost', d[1]); b.type = 'button'; b.dataset.decision = d[0]; let armed = false;
                        b.addEventListener('click', async function () {
                            msg.textContent = '';
                            if (!nt.value.trim()) { msg.textContent = 'Javob izohini yozing.'; return; }
                            if (!armed) { armed = true; b.textContent = 'Aniqmi? Qayta bosing'; setTimeout(function () { armed = false; b.textContent = d[1]; }, 4000); return; }
                            b.disabled = true;
                            try { await call('POST', '/admin/appeals/' + a.id + '/resolve', token, { decision: d[0], note: nt.value }); toast('Javob yuborildi'); await loadAppeals(); }
                            catch (err) { if (err.auth) { onAuthError(); return; } msg.textContent = say(String(err.message)); b.disabled = false; }
                        });
                        bar.appendChild(b);
                    });
                    c.appendChild(bar); abox.appendChild(c);
                });
                abox.appendChild(msg);
            }
            async function loadTournaments() {
                tbox.textContent = '';
                tbox.appendChild(el('h2', 'pg-h3', 'Mavsumiy turnirlar'));
                const msg = el('p', 'pg-muted'); msg.setAttribute('role', 'alert');
                async function act(path, body, ok) {
                    msg.textContent = '';
                    try { await call('POST', path, token, body || {}); toast(ok); await loadTournaments(); }
                    catch (err) { if (err.auth) { onAuthError(); return; } msg.textContent = say(String(err.message)); }
                }
                const f = el('form', 'pg-card'); f.noValidate = true; f.appendChild(el('h3', 'pg-h3', 'Yangi turnir'));
                const ti = el('input', 'pg-input'); ti.type = 'text'; ti.maxLength = 100; ti.placeholder = 'Nomi: Kuz kubogi'; ti.setAttribute('aria-label', 'Turnir nomi');
                const tp = el('input', 'pg-input'); tp.type = 'text'; tp.maxLength = 200; tp.placeholder = 'Mavzu: Python asoslari'; tp.setAttribute('aria-label', 'Mavzu');
                const td = el('select', 'pg-input'); td.setAttribute('aria-label', 'Tur davomiyligi'); for (let d = 1; d <= 7; d++) { const o = el('option', '', 'Har tur ' + d + ' kun'); o.value = String(d); td.appendChild(o); } td.value = '2';
                const tb = el('button', 'pg-btn', 'Yaratish'); tb.type = 'submit'; tb.style.marginTop = '8px';
                [ti, tp, td, tb].forEach(function (x) { f.appendChild(x); });
                f.addEventListener('submit', async function (e) {
                    e.preventDefault();
                    if (!ti.value.trim() || !tp.value.trim()) { msg.textContent = 'Nom va mavzuni kiriting.'; return; }
                    await act('/admin/tournaments', { title: ti.value, topic: tp.value, round_days: Number(td.value) }, 'Turnir yaratildi');
                });
                tbox.appendChild(f);
                let r;
                try { r = await call('GET', '/admin/tournaments', token); } catch (e) { if (e.auth) { onAuthError(); return; } tbox.appendChild(el('p', 'pg-muted', "Turnirlarni yuklab bo'lmadi.")); return; }
                (r.tournaments || []).forEach(function (t) {
                    const c = el('div', 'pg-card'); c.dataset.tournament = String(t.id);
                    c.appendChild(el('h3', 'pg-h3', t.title + ' · ' + (STATUS[t.status] || t.status)));
                    c.appendChild(el('p', 'pg-muted', 'Mavzu: ' + t.topic + ' · Har tur ' + t.round_days + ' kun · Jamoalar: ' + t.teams.length));
                    t.teams.forEach(function (x) {
                        const row = el('div'); row.dataset.team = String(x.team_id);
                        row.appendChild(document.createTextNode(x.name + (x.group_no ? ' · ' + String.fromCharCode(64 + x.group_no) + ' guruhi' : '')));
                        if (t.status === 'open') {
                            const rm = el('button', 'pg-btn ghost', 'Chiqarish'); rm.type = 'button'; rm.style.cssText = 'margin-left:8px;padding:4px 10px';
                            rm.addEventListener('click', function () { act('/admin/tournaments/' + t.id + '/remove-team', { team_id: x.team_id }, 'Jamoa chiqarildi'); });
                            row.appendChild(rm);
                        }
                        c.appendChild(row);
                    });
                    if (t.champion) c.appendChild(el('p', 'pg-muted', '🏆 Chempion: ' + t.champion.name));
                    else if (t.playoff_stage) c.appendChild(el('p', 'pg-muted', 'Pley-off: ' + (STAGE_NAME[t.playoff_stage]) + (t.stage_finished ? ' tugadi.' : ' davom etmoqda.')));
                    if (t.status === 'groups') {
                        c.appendChild(el('p', 'pg-muted', t.groups_finished ? "Guruh bosqichi tugadi. Pley-offni boshlashingiz mumkin." : (t.next_round ? 'Keyingi: ' + t.next_round + '-tur (jami ' + t.rounds_total + ' tur)' + (t.round_ready ? '' : '. Oldingi tur tugashini kuting.') : '')));
                    }
                    const bar = el('div'); bar.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap';
                    if (t.status === 'groups' && t.next_round) {
                        const sr = el('button', 'pg-btn', t.next_round + '-turni boshlash'); sr.type = 'button'; let go = false;
                        if (!t.round_ready) { sr.disabled = true; sr.style.opacity = '.45'; sr.style.cursor = 'not-allowed'; }
                        sr.addEventListener('click', function () {
                            if (!go) { go = true; sr.textContent = 'Aniqmi? Qayta bosing'; setTimeout(function () { go = false; sr.textContent = t.next_round + '-turni boshlash'; }, 4000); return; }
                            sr.disabled = true; msg.textContent = 'Savollar tayyorlanmoqda…';
                            act('/admin/tournaments/' + t.id + '/start-round', {}, t.next_round + '-tur boshlandi').then(function () { sr.disabled = false; });
                        });
                        bar.appendChild(sr);
                    }
                    if ((t.status === 'groups' || t.status === 'playoffs') && t.next_stage) {
                        const label = t.next_stage === 'start' ? 'Pley-offni boshlash' : STAGE_NAME[t.next_stage] + 'ni boshlash';
                        const ps = el('button', 'pg-btn', label); ps.type = 'button'; let armed2 = false;
                        ps.addEventListener('click', function () {
                            if (!armed2) { armed2 = true; ps.textContent = 'Aniqmi? Qayta bosing'; setTimeout(function () { armed2 = false; ps.textContent = label; }, 4000); return; }
                            ps.disabled = true; msg.textContent = 'Savollar tayyorlanmoqda…';
                            act('/admin/tournaments/' + t.id + '/start-round', {}, 'Bosqich boshlandi').then(function () { ps.disabled = false; });
                        });
                        bar.appendChild(ps);
                    }
                    if (t.status === 'open') {
                        const dr = el('button', 'pg-btn', 'Qura tashlash'); dr.type = 'button'; let armed = false;
                        dr.addEventListener('click', function () {
                            if (!armed) { armed = true; dr.textContent = 'Aniqmi? Qayta bosing'; setTimeout(function () { armed = false; dr.textContent = 'Qura tashlash'; }, 4000); return; }
                            act('/admin/tournaments/' + t.id + '/draw', {}, "Guruhlar e'lon qilindi");
                        });
                        bar.appendChild(dr);
                    }
                    if (t.status === 'open' || t.status === 'groups' || t.status === 'playoffs') {
                        const qb = el('button', 'pg-btn ghost', 'Savollar'); qb.type = 'button';
                        qb.addEventListener('click', function () { const old = c.querySelector('[data-editor]'); if (old) { old.remove(); return; } c.appendChild(questionEditor(t, token, toast, onAuthError)); });
                        bar.appendChild(qb);
                        const cn = el('button', 'pg-btn ghost', 'Bekor qilish'); cn.type = 'button'; let sure = false;
                        cn.addEventListener('click', function () {
                            if (!sure) { sure = true; cn.textContent = 'Aniqmi? Qayta bosing'; setTimeout(function () { sure = false; cn.textContent = 'Bekor qilish'; }, 4000); return; }
                            act('/admin/tournaments/' + t.id + '/cancel', {}, 'Turnir bekor qilindi');
                        });
                        bar.appendChild(cn);
                    }
                    c.appendChild(bar); tbox.appendChild(c);
                });
                tbox.appendChild(msg);
            }

            async function load() {
                box.textContent = '';
                let r;
                try { r = await call('GET', '/admin/battles', token); } catch (e) {
                    if (e.auth) { onAuthError(); return; }
                    box.appendChild(el('p', 'pg-muted', "Ro'yxatni yuklab bo'lmadi.")); return;
                }
                if (!r.battles.length) { box.appendChild(el('div', 'pg-card', 'Hozircha baholashni kutayotgan battle yo\'q.')); return; }
                r.battles.forEach(function (b) {
                    const c = el('div', 'pg-card');
                    c.appendChild(el('h3', 'pg-h3', b.title)); c.appendChild(el('p', 'pg-muted', 'Mavzu: ' + b.topic));
                    const msg = el('p', 'pg-muted'); msg.setAttribute('role', 'alert');
                    b.teams.forEach(function (t) {
                        const row = el('div'); row.style.cssText = 'border-top:1px solid var(--line,#8883);padding:10px 0;display:grid;gap:6px';
                        row.dataset.team = String(t.team_id);
                        row.appendChild(el('b', '', t.name));
                        if (!t.submission) { row.appendChild(el('span', 'pg-muted', "Loyiha topshirmagan: 0 ball beriladi.")); c.appendChild(row); return; }
                        const lk = el('div'); lk.appendChild(linkNode(t.submission.link)); row.appendChild(lk);
                        if (t.submission.note) row.appendChild(el('span', 'pg-muted', t.submission.note));
                        const form = el('form'); form.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center'; form.noValidate = true;
                        const sc = el('input', 'pg-input'); sc.type = 'number'; sc.min = '0'; sc.max = String(r.max_score); sc.step = '1'; sc.style.width = '90px'; sc.setAttribute('aria-label', 'Ball');
                        if (t.score !== null) sc.value = String(t.score);
                        const cm = el('input', 'pg-input'); cm.type = 'text'; cm.maxLength = 300; cm.placeholder = 'Izoh (ixtiyoriy)'; cm.setAttribute('aria-label', 'Izoh'); cm.style.flex = '1 1 180px';
                        if (t.comment) cm.value = t.comment;
                        const sv = el('button', 'pg-btn', 'Saqlash'); sv.type = 'submit'; sv.style.padding = '8px 14px';
                        form.appendChild(sc); form.appendChild(cm); form.appendChild(sv); row.appendChild(form);
                        form.addEventListener('submit', async function (e) {
                            e.preventDefault(); msg.textContent = '';
                            const n = sc.value === '' ? NaN : Number(sc.value);
                            try { await call('POST', '/admin/battles/' + b.id + '/score', token, { team_id: t.team_id, score: n, comment: cm.value }); toast('Ball saqlandi'); }
                            catch (err) { if (err.auth) { onAuthError(); return; } msg.textContent = say(String(err.message)); }
                        });
                        c.appendChild(row);
                    });
                    const fin = el('button', 'pg-btn', 'Yakunlash'); fin.type = 'button'; fin.style.marginTop = '12px';
                    let armed = false;
                    fin.addEventListener('click', async function () {
                        if (!armed) { armed = true; fin.textContent = "Aniqmi? Qayta bosing"; setTimeout(function () { armed = false; fin.textContent = 'Yakunlash'; }, 4000); return; }
                        msg.textContent = '';
                        try { await call('POST', '/admin/battles/' + b.id + '/finish', token, {}); toast('Battle yakunlandi'); await load(); }
                        catch (err) { if (err.auth) { onAuthError(); return; } armed = false; fin.textContent = 'Yakunlash'; msg.textContent = say(String(err.message)); }
                    });
                    c.appendChild(fin); c.appendChild(msg); box.appendChild(c);
                });
            }
            await load();
            await loadAppeals();
            await loadTournaments();
        }
    };
})();
