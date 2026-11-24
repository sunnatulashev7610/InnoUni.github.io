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
    function say(m) {
        if (/Score every team/i.test(m)) return "Avval topshirgan har bir jamoani baholang.";
        if (/whole number/i.test(m)) return "Ball 0 dan 100 gacha butun son bo'lsin.";
        if (/Groups need/i.test(m)) return "Guruh tuzish uchun 4, 6–8 yoki 12–16 jamoa kerak. Hozirgi sonni o'zgartiring.";
        if (/not possible in the current stage/i.test(m)) return "Bu qadam hozirgi bosqichda mumkin emas.";
        if (/Round length/i.test(m)) return "Tur davomiyligi 1–7 kun bo'lsin.";
        if (/not waiting for the judge/i.test(m)) return "Bu battle endi baholanmaydi.";
        return "Amalni bajarib bo'lmadi. Keyinroq urinib ko'ring.";
    }
    function linkNode(url) {
        if (!/^https:\/\//i.test(String(url))) return el('span', '', String(url));
        const a = el('a', '', String(url)); a.href = String(url); a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
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

            const STATUS = { open: "Ro'yxatdan o'tish ochiq", groups: 'Guruh bosqichi', knockout: 'Pley-off', finished: 'Tugagan' };
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
                    const bar = el('div'); bar.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap';
                    if (t.status === 'open') {
                        const dr = el('button', 'pg-btn', 'Qura tashlash'); dr.type = 'button'; let armed = false;
                        dr.addEventListener('click', function () {
                            if (!armed) { armed = true; dr.textContent = 'Aniqmi? Qayta bosing'; setTimeout(function () { armed = false; dr.textContent = 'Qura tashlash'; }, 4000); return; }
                            act('/admin/tournaments/' + t.id + '/draw', {}, "Guruhlar e'lon qilindi");
                        });
                        bar.appendChild(dr);
                    }
                    if (t.status === 'open' || t.status === 'groups') {
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
            await loadTournaments();
        }
    };
})();
