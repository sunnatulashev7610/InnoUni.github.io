/* Orders pages of the dashboard (real session only).
   Student: ask for a course/material (teachers answer with a price or "free") or order a tariff (admin answers).
   Teacher: answer incoming requests. Needs dashboard-data.js (window.GEData). Text is always set with textContent. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get; const send = G.api.send;

    const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so\'m';
    const KIND = { course: ['Kurs', 'fas fa-graduation-cap'], material: ['Material', 'fas fa-book'], tariff: ['Tarif', 'fas fa-crown'] };
    const STATUS = {
        pending: ['Kutilmoqda', 'sun'], offered: ['Narx belgilandi', 'sky'], confirmed: ['Tasdiqlangan', ''],
        rejected: ['Rad etildi', 'coral'], cancelled: ['Bekor qilingan', 'coral']
    };
    const PLANS = ['Standart tarif', 'Markaz tarifi (10 o\'quvchi)'];

    function relogin() { location.href = '../login/login.html'; }
    function btn(label, cls, onClick) {
        const b = el('button', 'pg-btn ' + (cls || ''), label); b.type = 'button';
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }
    function priceText(o) { return o.price === 0 ? 'Tekin' : money(o.price); }
    function note(text) { const p = el('p', 'pg-muted', text); p.style.cssText = 'margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere'; return p; }
    function msgBox() { const m = el('p', 'pg-muted'); m.setAttribute('role', 'alert'); m.style.cssText = 'min-height:1.2em;margin:8px 0 0'; return m; }
    function labelled(text, input, id) { const w = el('div'); const l = el('label', 'pg-lbl', text); l.htmlFor = id; input.id = id; w.appendChild(l); w.appendChild(input); return w; }

    // ---------------- Student ----------------
    G.register('orders', async function (root, session) {
        root.textContent = '';
        const pg = el('div', 'pg'); root.appendChild(pg);
        const hd = el('div', 'pg-head'); const hdd = el('div');
        hdd.appendChild(el('h1', '', 'Buyurtmalar'));
        hdd.appendChild(el('p', '', 'Kerakli kurs yoki materialni so\'rang. Narxni o\'qituvchi so\'rovingizni ko\'rib o\'zi belgilaydi'));
        hd.appendChild(hdd); pg.appendChild(hd);

        const wrap = el('div', 'pg-detail'); pg.appendChild(wrap);
        const left = el('div'); wrap.appendChild(left);
        const chips = el('div', 'pg-chips'); chips.setAttribute('data-managed', ''); left.appendChild(chips);
        const list = el('div', 'pg-orders'); left.appendChild(list);

        let orders = (await get('/orders/mine', session)).orders;
        let filter = 'all';
        const FILTERS = [['all', 'Hammasi'], ['pending', 'Kutilmoqda'], ['offered', 'Javob keldi'], ['confirmed', 'Tasdiqlangan']];

        async function act(path, bt, msg) {
            bt.disabled = true;
            try { await send('POST', path, session); await reload(); }
            catch (e) { if (e.auth) { relogin(); return; } bt.disabled = false; msg.textContent = e.message; }
        }
        async function reload() { orders = (await get('/orders/mine', session)).orders; draw(); }

        function drawChips() {
            chips.textContent = '';
            FILTERS.forEach(function (f) {
                const n = f[0] === 'all' ? orders.length : orders.filter(function (o) { return o.status === f[0]; }).length;
                const b = el('button', 'pg-chip' + (filter === f[0] ? ' on' : ''), f[1] + ' (' + n + ')'); b.type = 'button'; b.dataset.cat = f[0];
                b.addEventListener('click', function () { filter = f[0]; draw(); });
                chips.appendChild(b);
            });
        }
        function orderCard(o) {
            const row = el('div', 'pg-order'); row.style.flexWrap = 'wrap';
            const ic = el('div', 'ic'); ic.style.cssText = 'background:var(--info-soft);color:var(--info)'; ic.appendChild(el('i', KIND[o.kind][1]));
            const mid = el('div', 'mid');
            mid.appendChild(el('b', '', o.item_title));
            mid.appendChild(el('span', 'pg-muted', KIND[o.kind][0] + ' · ' + new Date(o.created_at).toLocaleDateString('uz-UZ')));
            const end = el('div', 'end');
            const st = STATUS[o.status];
            end.appendChild(el('span', 'pg-pill ' + st[1], st[0]));
            if (o.price !== null) { const p = el('b', '', priceText(o)); p.style.color = 'var(--ink)'; end.appendChild(p); }
            row.appendChild(ic); row.appendChild(mid); row.appendChild(end);

            const more = el('div'); more.style.cssText = 'flex-basis:100%';
            if (o.note) more.appendChild(note('Shartlaringiz: ' + o.note));
            if (o.reply) more.appendChild(note((o.kind === 'tariff' ? 'Admin izohi: ' : 'O\'qituvchi javobi: ') + o.reply));
            if (o.status === 'pending') more.appendChild(note(o.kind === 'tariff' ? 'Admin ko\'rib chiqmoqda.' : 'O\'qituvchi ko\'rib chiqmoqda. Narx shundan keyin belgilanadi.'));
            if (o.status === 'confirmed' && o.kind === 'tariff') more.appendChild(note('Tarif faollashtirildi.'));
            const msg = msgBox();
            if (o.status === 'offered' || o.status === 'pending') {
                const acts = el('div'); acts.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap';
                if (o.status === 'offered') {
                    const ok = btn('Qabul qilish', 'sun', function () { act('/orders/' + o.id + '/accept', ok, msg); }); acts.appendChild(ok);
                }
                const no = btn(o.status === 'offered' ? 'Rad etish' : 'Bekor qilish', 'ghost', function () { act('/orders/' + o.id + '/cancel', no, msg); });
                acts.appendChild(no); more.appendChild(acts);
            }
            more.appendChild(msg);
            row.appendChild(more);
            return row;
        }
        function draw() {
            drawChips();
            list.textContent = '';
            const shown = orders.filter(function (o) { return filter === 'all' || o.status === filter; });
            if (!shown.length) { list.appendChild(el('p', 'pg-muted', orders.length ? 'Bu bo\'limda buyurtma yo\'q.' : 'Hali buyurtma bermagansiz. O\'ng tomondagi shakldan so\'rov yuboring.')); return; }
            shown.forEach(function (o) { list.appendChild(orderCard(o)); });
        }

        // ---- form ----
        const form = el('form', 'pg-card pg-order-form'); form.noValidate = true; form.style.alignSelf = 'start';
        form.appendChild(el('h3', 'pg-h3', 'Yangi buyurtma'));
        const seg = el('div', 'pg-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Buyurtma turi');
        let kind = 'course';
        const segBtns = {};
        [['course', 'Kurs'], ['material', 'Material'], ['tariff', 'Tarif']].forEach(function (k) {
            const b = el('button', k[0] === kind ? 'on' : '', k[1]); b.type = 'button';
            b.addEventListener('click', function () { setKind(k[0]); });
            segBtns[k[0]] = b; seg.appendChild(b);
        });
        form.appendChild(seg);
        const reqBox = el('div'); form.appendChild(reqBox);
        const title = el('input', 'pg-input'); title.type = 'text'; title.maxLength = 255;
        const cond = el('textarea', 'pg-input'); cond.rows = 4; cond.maxLength = 1000;
        reqBox.appendChild(labelled('Nima kerak?', title, 'ordTitle'));
        reqBox.appendChild(labelled('Shartlar (ixtiyoriy)', cond, 'ordNote'));
        const planBox = el('div'); planBox.hidden = true; form.appendChild(planBox);
        const plan = el('select', 'pg-input'); PLANS.forEach(function (p) { const o = el('option', '', p); o.value = p; plan.appendChild(o); });
        const period = el('select', 'pg-input'); ['Oylik', 'Yillik'].forEach(function (p) { const o = el('option', '', p); o.value = p; period.appendChild(o); });
        planBox.appendChild(labelled('Tarif', plan, 'ordPlan')); planBox.appendChild(labelled('To\'lov davri', period, 'ordPeriod'));
        const hint = el('p', 'pg-muted'); hint.style.cssText = 'margin:12px 0 0;font-size:13px';
        const msg = msgBox();
        const go = el('button', 'pg-btn', 'Buyurtma berish'); go.type = 'submit'; go.style.cssText = 'width:100%;justify-content:center;margin-top:14px';
        form.appendChild(go); form.appendChild(hint); form.appendChild(msg);
        const sugg = el('div'); form.appendChild(sugg);
        wrap.appendChild(form);

        function setKind(k) {
            kind = k;
            Object.keys(segBtns).forEach(function (x) { segBtns[x].className = x === k ? 'on' : ''; });
            reqBox.hidden = k === 'tariff'; planBox.hidden = k !== 'tariff';
            title.placeholder = k === 'material' ? 'Masalan: Python darsligi (PDF)' : 'Masalan: React kursi';
            hint.textContent = k === 'tariff' ? 'Tarif buyurtmasini admin ko\'rib chiqadi.' : 'So\'rov o\'qituvchilarga yuboriladi. Narxni o\'qituvchi belgilaydi yoki tekin qiladi.';
            sugg.textContent = ''; msg.textContent = '';
        }
        setKind('course');
        const preset = G.ctx.orderPreset; delete G.ctx.orderPreset;
        if (preset) {
            if (preset.type === 'tarif') { setKind('tariff'); if (PLANS.indexOf(preset.item) !== -1) plan.value = preset.item; period.value = preset.yearly ? 'Yillik' : 'Oylik'; }
            else { setKind(preset.type === 'material' ? 'material' : 'course'); title.value = preset.item || ''; }
        }

        async function place() {
            go.disabled = true; msg.textContent = '';
            const body = kind === 'tariff'
                ? { kind: 'tariff', item_title: plan.value + ' (' + period.value.toLowerCase() + ')' }
                : { kind: kind, item_title: title.value, note: cond.value };
            try {
                const r = await send('POST', '/orders', session, body);
                title.value = ''; cond.value = ''; sugg.textContent = '';
                G.toast(r.sentTo === 'admin' ? 'Buyurtma adminga yuborildi' : 'So\'rov o\'qituvchilarga yuborildi');
                await reload();
            } catch (e) { if (e.auth) { relogin(); return; } msg.textContent = e.message; }
            go.disabled = false;
        }
        function showSuggestions(s) {
            sugg.textContent = '';
            const box = el('div', 'pg-card'); box.style.cssText = 'margin-top:14px;background:var(--surface-2)';
            box.appendChild(el('b', '', 'Sizga mos tayyor kurs va materiallar bor'));
            box.appendChild(note('Avval shularni ko\'rib chiqing. Mos kelmasa, so\'rovni baribir yuborishingiz mumkin.'));
            s.courses.forEach(function (c) {
                const r = el('div', 'pg-row'); r.style.marginTop = '8px';
                const t = el('div'); t.appendChild(el('b', '', c.title)); t.appendChild(el('div', 'pg-muted', 'Kurs' + (c.teacher ? ' · ' + c.teacher : '')));
                r.appendChild(t);
                r.appendChild(btn(c.enrolled ? 'Ochish' : 'Kurslarda ko\'rish', 'ghost', function () {
                    if (c.enrolled) { G.ctx.courseId = c.id; G.open('course-detail', 'courses'); } else { G.open('courses', 'courses'); }
                }));
                box.appendChild(r);
            });
            s.materials.forEach(function (m) {
                const r = el('div', 'pg-row'); r.style.marginTop = '8px';
                const t = el('div'); t.appendChild(el('b', '', m.title)); t.appendChild(el('div', 'pg-muted', (m.kind === 'video' ? 'Video' : 'Qo\'llanma') + ' · ' + m.course + ' kursida'));
                r.appendChild(t);
                r.appendChild(btn(m.enrolled ? 'Ochish' : 'Kursni ko\'rish', 'ghost', function () {
                    if (m.enrolled) { G.ctx.courseId = m.courseId; G.open('course-detail', 'courses'); } else { G.open('courses', 'courses'); }
                }));
                box.appendChild(r);
            });
            const row = el('div'); row.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap';
            row.appendChild(btn('Baribir so\'rov yuborish', 'sun', place));
            row.appendChild(btn('O\'zgartirish', 'ghost', function () { sugg.textContent = ''; }));
            box.appendChild(row); sugg.appendChild(box);
        }
        form.addEventListener('submit', async function (ev) {
            ev.preventDefault(); msg.textContent = ''; sugg.textContent = '';
            if (kind !== 'tariff' && !title.value.trim()) { msg.textContent = 'Nima kerakligini yozing.'; return; }
            if (kind === 'tariff') { await place(); return; }
            go.disabled = true;
            try {
                const s = await get('/orders/suggestions?q=' + encodeURIComponent(title.value + ' ' + cond.value), session);
                go.disabled = false;
                if (s.courses.length || s.materials.length) { showSuggestions(s); return; }
            } catch (e) { if (e.auth) { relogin(); return; } /* suggestions are optional: send anyway */ }
            go.disabled = false;
            await place();
        });
        draw();
    });

    // ---------------- Teacher ----------------
    G.register('t-orders', async function (root, session) {
        root.textContent = '';
        const pg = el('div', 'pg'); root.appendChild(pg);
        const hd = el('div', 'pg-head'); const hdd = el('div');
        hdd.appendChild(el('h1', '', 'Buyurtmalar'));
        hdd.appendChild(el('p', '', 'O\'quvchilarning kurs va material so\'rovlari. Narx belgilang yoki tekin qiling'));
        hd.appendChild(hdd); pg.appendChild(hd);
        const chips = el('div', 'pg-chips'); chips.setAttribute('data-managed', ''); pg.appendChild(chips);
        const list = el('div', 'pg-orders'); pg.appendChild(list);

        let orders = (await get('/orders/incoming', session)).orders;
        let filter = 'pending';
        async function reload() { orders = (await get('/orders/incoming', session)).orders; draw(); }

        function drawChips() {
            chips.textContent = '';
            [['pending', 'Javob kutmoqda'], ['answered', 'Javob berilgan']].forEach(function (f) {
                const n = orders.filter(function (o) { return (o.status === 'pending') === (f[0] === 'pending'); }).length;
                const b = el('button', 'pg-chip' + (filter === f[0] ? ' on' : ''), f[1] + ' (' + n + ')'); b.type = 'button'; b.dataset.cat = f[0];
                b.addEventListener('click', function () { filter = f[0]; draw(); });
                chips.appendChild(b);
            });
        }
        function card(o) {
            const c = el('div', 'pg-card');
            const top = el('div'); top.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
            top.appendChild(el('span', 'pg-pill sky', KIND[o.kind][0]));
            const st = STATUS[o.status]; top.appendChild(el('span', 'pg-pill ' + st[1], st[0]));
            if (o.price !== null) top.appendChild(el('b', '', priceText(o)));
            c.appendChild(top);
            const h = el('h3', '', o.item_title); h.style.marginTop = '8px'; c.appendChild(h);
            c.appendChild(el('div', 'pg-muted', o.student + (o.course_title ? ' · ' + o.course_title + ' kursi' : '') + ' · ' + new Date(o.created_at).toLocaleDateString('uz-UZ')));
            if (o.note) c.appendChild(note('Shartlar: ' + o.note));
            if (o.reply) c.appendChild(note('Javobingiz: ' + o.reply));
            if (o.status !== 'pending') return c;

            const form = el('form'); form.noValidate = true; form.style.marginTop = '12px';
            const price = el('input', 'pg-input'); price.type = 'number'; price.min = 0; price.step = 1000; price.placeholder = 'Narx (so\'m)'; price.setAttribute('aria-label', 'Narx');
            const reply = el('input', 'pg-input'); reply.type = 'text'; reply.maxLength = 1000; reply.placeholder = 'O\'quvchiga izoh (ixtiyoriy)'; reply.setAttribute('aria-label', 'Izoh'); reply.style.marginTop = '8px';
            const msg = msgBox();
            const acts = el('div'); acts.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap';
            async function answer(path, body, bt) {
                msg.textContent = ''; bt.disabled = true;
                try { await send('POST', '/orders/' + o.id + '/' + path, session, body); G.toast('Javob yuborildi'); await reload(); }
                catch (e) { if (e.auth) { relogin(); return; } bt.disabled = false; msg.textContent = /No pending/.test(e.message) ? 'Bu so\'rovga boshqa o\'qituvchi javob bergan.' : e.message; }
            }
            const set = el('button', 'pg-btn sun', 'Narx belgilash'); set.type = 'submit';
            const free = btn('Tekin qilish', 'ghost', function () { answer('offer', { free: true, reply: reply.value }, free); });
            const no = btn('Rad etish', 'ghost', function () { answer('reject', { reply: reply.value }, no); });
            form.addEventListener('submit', function (ev) {
                ev.preventDefault();
                const n = Number(price.value);
                if (price.value === '' || !Number.isInteger(n) || n < 0) { msg.textContent = 'Narxni so\'mda, butun son qilib kiriting (yoki "Tekin qilish"ni bosing).'; return; }
                answer('offer', { price: n, reply: reply.value }, set);
            });
            [set, free, no].forEach(function (b) { acts.appendChild(b); });
            [price, reply, acts, msg].forEach(function (n) { form.appendChild(n); });
            c.appendChild(form);
            return c;
        }
        function draw() {
            drawChips();
            list.textContent = '';
            const shown = orders.filter(function (o) { return (o.status === 'pending') === (filter === 'pending'); });
            list.style.display = 'grid'; list.style.gap = '12px';
            if (!shown.length) { list.appendChild(el('p', 'pg-muted', filter === 'pending' ? 'Hozircha javob kutayotgan so\'rov yo\'q.' : 'Hali javob bermagansiz.')); return; }
            shown.forEach(function (o) { list.appendChild(card(o)); });
        }
        draw();
    });
})();
