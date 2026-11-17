/* AI tutor page (real session only). Demo mode keeps the canned chat from pages/ai.html. Needs dashboard-data.js. Text via textContent only. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el;

    // One warning text for every AI page, so users read the same thing everywhere
    const AI_WARN = 'AI xato qilishi mumkin. Muhim ma\'lumotlarni (sana, raqam, ta\'rif, formula) o\'zingiz tekshirib oling. AI yaratgan matnlardagi xatolar uchun Gather Edu javobgar emas.';
    function notice(text) {
        const n = el('div'); n.setAttribute('role', 'note');
        n.style.cssText = 'display:flex;gap:12px;align-items:flex-start;padding:12px 16px;border-radius:12px;background:rgba(245,166,35,.12);border:1px solid rgba(245,166,35,.45);margin-bottom:14px';
        const i = el('i', 'fas fa-triangle-exclamation'); i.style.cssText = 'color:#b36b00;margin-top:3px'; i.setAttribute('aria-hidden', 'true');
        const t = el('span', '', text || AI_WARN); t.style.lineHeight = '1.45';
        n.appendChild(i); n.appendChild(t); return n;
    }
    G.aiNotice = notice;

    const SUGGESTIONS = ['Buni oddiy tilda tushuntir', 'Menga 5 ta savoldan test tuz', 'Bitta misol keltir', 'Qaysi mavzuni takrorlashim kerak?'];

    G.register('ai', async function (root, session) {
        root.textContent = '';
        const pg = el('div', 'pg'); root.appendChild(pg);
        const teacher = session.role === 'teacher';

        const [status, courseData] = await Promise.all([
            G.api.get('/ai/status', session),
            G.api.get(teacher ? '/summary/teacher' : '/summary/student', session).catch(function () { return { courses: [] }; })
        ]);
        const courses = courseData.courses || [];
        let courseId = G.ctx.aiCourseId || null;
        if (courseId && !courses.some(function (c) { return c.id === courseId; })) courseId = null;
        G.ctx.aiCourseId = null;

        // ---- header ----
        const head = el('div', 'pg-head'); const hd = el('div');
        hd.appendChild(el('h1', '', 'AI ustoz')); hd.appendChild(el('p', '', 'Savol bering: ustoz tushuntiradi, misol keltiradi va tushunganingizni tekshiradi'));
        head.appendChild(hd);
        const pill = el('span', 'pg-pill ' + (status.live ? '' : 'sky'), status.live ? 'AI faol' : 'Demo javoblar');
        head.appendChild(pill); pg.appendChild(head);
        pg.appendChild(notice('AI xato qilishi mumkin. Muhim narsalarni o\'qituvchi yoki kurs materiallari bilan tekshiring. AI javoblari uchun Gather Edu javobgar emas.'));

        const grid = el('div', 'pg-ai'); pg.appendChild(grid);

        // ---- chat ----
        const chat = el('section', 'pg-card pg-chat'); grid.appendChild(chat);
        const chatHead = el('div', 'pg-chat-h');
        const select = el('select', 'pg-input'); select.setAttribute('aria-label', 'Kurs tanlang');
        const general = el('option', '', 'Umumiy savol'); general.value = ''; select.appendChild(general);
        courses.forEach(function (c) { const o = el('option', '', c.title); o.value = String(c.id); select.appendChild(o); });
        select.value = courseId ? String(courseId) : '';
        chatHead.appendChild(select); chat.appendChild(chatHead);
        const box = el('div', 'pg-msgs'); box.setAttribute('aria-live', 'polite'); chat.appendChild(box);
        const form = el('form', 'pg-send');
        const input = el('input', 'pg-input'); input.placeholder = 'Savolingizni yozing...'; input.maxLength = 1000; input.setAttribute('aria-label', 'Savol');
        const send = el('button'); send.type = 'submit'; send.setAttribute('aria-label', 'Yuborish'); send.appendChild(el('i', 'fas fa-paper-plane'));
        form.appendChild(input); form.appendChild(send); chat.appendChild(form);

        // ---- side ----
        const side = el('aside'); grid.appendChild(side);
        const meter = el('div', 'pg-card');
        const meterText = el('b'); meterText.style.display = 'block'; meterText.style.marginBottom = '10px';
        const meterBar = el('div', 'pg-bar'); const meterFill = document.createElement('i'); meterBar.appendChild(meterFill);
        meter.appendChild(meterText); meter.appendChild(meterBar);
        meter.appendChild(el('p', 'pg-muted', 'Savollar har kuni yangilanadi.'));
        side.appendChild(meter);
        const sug = el('div', 'pg-card'); sug.style.marginTop = '14px';
        const st = el('b', '', 'Tezkor savollar'); st.style.cssText = 'display:block;margin-bottom:12px'; sug.appendChild(st);
        const sugBox = el('div', 'pg-sug');
        SUGGESTIONS.forEach(function (t) { const b = el('button', '', t); b.type = 'button'; b.addEventListener('click', function () { ask(t); }); sugBox.appendChild(b); });
        sug.appendChild(sugBox); side.appendChild(sug);
        side.appendChild(notice('AI xato qilishi mumkin. Muhim narsalarni o\'qituvchi yoki kurs materiallari bilan tekshiring.')); side.lastChild.style.marginTop = '14px';
        const clear = el('button', 'pg-btn ghost', 'Suhbatni tozalash'); clear.type = 'button'; clear.style.marginTop = '8px'; side.appendChild(clear);

        function renderMeter(s) {
            meterText.textContent = 'Bugun ' + s.remaining + ' ta savol qoldi (' + s.limit + ' dan)';
            meterFill.style.width = Math.max(0, Math.min(100, 100 * s.remaining / s.limit)) + '%';
            send.disabled = input.disabled = s.remaining <= 0;
            if (s.remaining <= 0) input.placeholder = 'Bugungi savollar tugadi';
        }
        renderMeter(status);

        function bubble(text, cls) {
            const d = el('div', 'pg-msg ' + cls); d.style.whiteSpace = 'pre-wrap'; d.textContent = text; box.appendChild(d); box.scrollTop = box.scrollHeight; return d;
        }
        const query = function () { return courseId ? '?course_id=' + courseId : ''; };

        async function loadHistory() {
            box.textContent = '';
            const h = await G.api.get('/ai/history' + query(), session);
            if (!h.messages.length) bubble(courseId ? 'Salom! Men shu kurs bo\'yicha ustozingizman. Qaysi mavzu tushunarsiz?' : 'Salom! Men Gather Edu AI ustozingizman. Bugun nimani o\'rganamiz?', 'bot');
            h.messages.forEach(function (m) { bubble(m.content, m.role === 'assistant' ? 'bot' : 'me'); });
        }
        await loadHistory();

        let waiting = false;
        async function ask(text) {
            text = String(text || '').trim();
            if (!text || waiting || input.disabled) return;
            waiting = true; send.disabled = true;
            bubble(text, 'me');
            const typing = bubble('Ustoz yozmoqda...', 'bot'); typing.style.opacity = '.7';
            try {
                const r = await G.api.send('POST', '/ai/chat', session, courseId ? { message: text, course_id: courseId } : { message: text });
                typing.style.opacity = ''; typing.textContent = r.reply;
                renderMeter(r);
                input.value = '';
            } catch (e) {
                if (e.auth) throw e;
                typing.remove();
                if (e.status === 429 && e.data && typeof e.data.remaining === 'number') { renderMeter(e.data); bubble('Bugungi savollar tugadi. Ertaga davom etamiz.', 'bot'); }
                else if (e.status === 429) bubble('Oldingi javobni kuting.', 'bot');
                else bubble('AI hozir javob bermayapti. Birozdan keyin qayta urinib ko\'ring.', 'bot');
            }
            waiting = false; if (!input.disabled) send.disabled = false;
        }

        form.addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); ask(input.value); });
        select.addEventListener('change', function () { courseId = select.value ? Number(select.value) : null; loadHistory().catch(function () {}); });
        let armed = false;
        clear.addEventListener('click', async function () {
            if (!armed) { armed = true; clear.textContent = 'Aniq tozalaymi?'; setTimeout(function () { armed = false; clear.textContent = 'Suhbatni tozalash'; }, 4000); return; }
            armed = false; clear.textContent = 'Suhbatni tozalash';
            await G.api.send('DELETE', '/ai/history' + query(), session);
            await loadHistory();
        });
    });
    // ---- AI course creator: brief -> private course -> optionally public ----
    G.register('ai-courses', async function (root, session) {
        root.textContent = '';
        const pg = el('div', 'pg'); root.appendChild(pg);
        const data = await G.api.get('/ai-courses', session);
        const status = await G.api.get('/ai/status', session);

        const head = el('div', 'pg-head'); const hd = el('div');
        hd.appendChild(el('h1', '', 'AI kurs yaratuvchi')); hd.appendChild(el('p', '', 'Mavzu ayting: AI kurs tuzib beradi. Kurs sizda shaxsiy turadi, xohlasangiz public qilasiz'));
        head.appendChild(hd); head.appendChild(el('span', 'pg-pill ' + (status.live ? '' : 'sky'), status.live ? 'AI faol' : 'Demo rejim'));
        pg.appendChild(head);
        pg.appendChild(notice(AI_WARN + ' Kursni public qilishdan oldin o\'zingiz to\'liq o\'qib chiqing.'));

        // form
        const form = el('form', 'pg-card');
        const meter = el('b'); meter.style.display = 'block'; meter.style.marginBottom = '10px';
        form.appendChild(meter);
        function field(label, node) { const l = el('label', 'pg-lbl', label); form.appendChild(l); form.appendChild(node); return node; }
        const topic = field('Kurs mavzusi', el('input', 'pg-input')); topic.maxLength = 200; topic.placeholder = 'Masalan: JavaScript asoslari'; topic.required = true;
        const level = field('Daraja', el('select', 'pg-input'));
        ['boshlang\'ich', 'o\'rta', 'yuqori'].forEach(function (v) { const o = el('option', '', v); o.value = v; level.appendChild(o); });
        const lessons = field('Darslar soni', el('select', 'pg-input'));
        [3, 4, 5, 6, 7, 8].forEach(function (n) { const o = el('option', '', String(n)); o.value = String(n); lessons.appendChild(o); });
        lessons.value = '5';
        const style = field('Uslub (ixtiyoriy)', el('input', 'pg-input')); style.maxLength = 200; style.placeholder = 'Masalan: oddiy tilda, ko\'p misol bilan';
        const goal = field('Maqsad (ixtiyoriy)', el('input', 'pg-input')); goal.maxLength = 300; goal.placeholder = 'Masalan: 2 haftada sayt yasashni o\'rganish';
        const msg = el('p', 'pg-muted'); msg.style.minHeight = '1.2em';
        const go = el('button', 'pg-btn', 'Kursni yaratish'); go.type = 'submit'; go.style.marginTop = '14px';
        form.appendChild(go); form.appendChild(msg); pg.appendChild(form);

        const listBox = el('div'); listBox.style.marginTop = '18px'; pg.appendChild(listBox);

        let courses = data.courses;
        function drawMeter(u) {
            meter.textContent = 'Bugun ' + u.remaining + ' ta kurs yaratish qoldi (' + u.limit + ' dan)';
            go.disabled = u.remaining <= 0;
        }
        drawMeter(data);

        function drawList() {
            listBox.textContent = '';
            listBox.appendChild(el('h3', 'pg-h3', 'Mening AI kurslarim'));
            if (!courses.length) { listBox.appendChild(el('p', 'pg-muted', 'Hozircha yo\'q. Yuqoridagi shakl orqali birinchi kursni yarating.')); return; }
            courses.forEach(function (c) {
                const card = el('section', 'pg-card'); card.style.marginTop = '12px';
                const top = el('div'); top.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
                top.appendChild(el('span', 'pg-pill ' + (c.public ? '' : 'sun'), c.public ? 'Public' : 'Shaxsiy'));
                if (c.demo) top.appendChild(el('span', 'pg-pill sky', 'Demo'));
                card.appendChild(top);
                const h = el('h3', '', c.title); h.style.marginTop = '8px'; card.appendChild(h);
                card.appendChild(el('div', 'pg-muted', 'Gather Edu × ' + (session.name || 'siz') + ' · ' + c.lessons + ' ta dars' + (c.public ? ' · ' + c.students + ' o\'quvchi' : '')));
                if (c.description) { const d = el('p', 'pg-muted', c.description); d.style.margin = '8px 0 0'; card.appendChild(d); }
                const row = el('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px';
                const open = el('button', 'pg-btn ghost', 'Darslarni ko\'rish'); open.type = 'button';
                const body = el('div'); body.hidden = true; body.style.marginTop = '12px';
                let loaded = false;
                open.addEventListener('click', async function () {
                    body.hidden = !body.hidden;
                    open.textContent = body.hidden ? 'Darslarni ko\'rish' : 'Yopish';
                    if (body.hidden || loaded) return;
                    try {
                        const r = await G.api.get('/ai-courses/' + c.id, session);
                        r.lessons.forEach(function (l, i) {
                            const d = el('details'); d.style.marginTop = '6px';
                            d.appendChild(el('summary', '', (i + 1) + '. ' + l.title));
                            const t = el('div', 'pg-muted', l.body); t.style.cssText = 'white-space:pre-wrap;margin-top:6px'; d.appendChild(t);
                            const ed = el('button', 'pg-btn ghost', 'Tahrirlash'); ed.type = 'button'; ed.style.marginTop = '8px'; d.appendChild(ed);
                            const form = el('form'); form.hidden = true; form.style.cssText = 'display:grid;gap:8px;margin-top:8px';
                            const ti = el('input'); ti.maxLength = 200; ti.setAttribute('aria-label', 'Dars sarlavhasi');
                            const ta = el('textarea'); ta.maxLength = 4000; ta.rows = 10; ta.setAttribute('aria-label', 'Dars matni');
                            const save = el('button', 'pg-btn', 'Saqlash'); save.type = 'submit';
                            form.appendChild(ti); form.appendChild(ta); form.appendChild(save); d.appendChild(form);
                            ed.addEventListener('click', function () { form.hidden = !form.hidden; ti.value = l.title; ta.value = l.body; });
                            form.addEventListener('submit', async function (ev) {
                                ev.preventDefault(); save.disabled = true;
                                try {
                                    await G.api.send('PUT', '/ai-courses/' + c.id + '/lessons/' + l.id, session, { title: ti.value, body: ta.value });
                                    l.title = ti.value.trim(); l.body = ta.value.trim();
                                    t.textContent = l.body; d.querySelector('summary').textContent = (i + 1) + '. ' + l.title;
                                    form.hidden = true; G.toast('Dars saqlandi');
                                } catch (e) {
                                    if (e.auth) throw e;
                                    G.toast(e.status === 400 ? 'Sarlavha va matn bo\'sh bo\'lmasin' : 'Saqlab bo\'lmadi');
                                } finally { save.disabled = false; }
                            });
                            body.appendChild(d);
                        });
                        loaded = true;
                    } catch (e) { if (e.auth) throw e; body.appendChild(el('p', 'pg-muted', 'Darslarni yuklab bo\'lmadi.')); }
                });
                row.appendChild(open);
                const pub = el('button', 'pg-btn' + (c.public ? ' ghost' : ''), c.public ? 'Shaxsiy qilish' : 'Public qilish'); pub.type = 'button';
                if (c.demo && !c.public) { pub.disabled = true; pub.title = 'Demo kursni public qilib bo\'lmaydi. AI ulangach mumkin.'; }
                const confirm = el('div'); confirm.hidden = true; confirm.style.cssText = 'margin-top:12px;padding:14px 16px;border-radius:12px;border:1px solid rgba(245,166,35,.45);background:rgba(245,166,35,.1)';
                const lbl = el('label'); lbl.style.cssText = 'display:flex;gap:10px;align-items:flex-start;line-height:1.45;cursor:pointer';
                const chk = el('input'); chk.type = 'checkbox'; chk.style.marginTop = '4px';
                lbl.appendChild(chk); lbl.appendChild(el('span', '', 'Kursni o\'qib chiqdim va tekshirdim. Public kursdagi xatolar uchun yaratuvchi sifatida men javob beraman. Gather Edu AI xatolari uchun javobgar emas.'));
                const yes = el('button', 'pg-btn', 'Public qilish'); yes.type = 'button'; yes.disabled = true; yes.style.marginTop = '10px';
                chk.addEventListener('change', function () { yes.disabled = !chk.checked; });
                confirm.appendChild(lbl); confirm.appendChild(yes);
                async function setPublic(on) {
                    pub.disabled = yes.disabled = true;
                    try {
                        await G.api.send('PATCH', '/ai-courses/' + c.id, session, on ? { public: true, confirmed: true } : { public: false });
                        c.public = on; drawList();
                        G.toast(on ? 'Kurs "Kurslar" sahifasida ko\'rinadi' : 'Kurs endi faqat sizda');
                    } catch (e) {
                        if (e.auth) throw e;
                        pub.disabled = false; yes.disabled = !chk.checked;
                        G.toast(e.data && e.data.code === 'EMAIL_NOT_VERIFIED' ? 'Avval emailingizni tasdiqlang' : 'Bajarilmadi, qayta urinib ko\'ring');
                    }
                }
                pub.addEventListener('click', function () { if (c.public) setPublic(false); else confirm.hidden = !confirm.hidden; });
                yes.addEventListener('click', function () { if (chk.checked) setPublic(true); });
                row.appendChild(pub);
                const del = el('button', 'pg-btn ghost', 'O\'chirish'); del.type = 'button';
                G.twice(del, 'Aniq o\'chiraymi?', async function () {
                    try {
                        await G.api.send('DELETE', '/ai-courses/' + c.id, session);
                        courses = courses.filter(function (x) { return x.id !== c.id; }); drawList();
                    } catch (e) {
                        if (e.auth) throw e;
                        G.toast(e.status === 409 ? 'Kursda o\'quvchilar bor. Avval shaxsiy qiling' : 'O\'chirib bo\'lmadi');
                    }
                });
                row.appendChild(del);
                if (c.public) {
                    const rep = el('button', 'pg-btn ghost', 'Xato xabarlari' + (c.reports ? ' (' + c.reports + ')' : '')); rep.type = 'button';
                    const repBox = el('div'); repBox.hidden = true; repBox.style.marginTop = '12px';
                    rep.addEventListener('click', async function () {
                        repBox.hidden = !repBox.hidden;
                        if (repBox.hidden) return;
                        repBox.textContent = '';
                        try {
                            const r = await G.api.get('/ai-courses/' + c.id + '/reports', session);
                            if (!r.reports.length) repBox.appendChild(el('p', 'pg-muted', 'Ochiq xato xabarlari yo\'q.'));
                            r.reports.forEach(function (x) {
                                const it = el('div', 'pg-card'); it.style.marginTop = '8px';
                                it.appendChild(el('b', '', x.lesson_title ? 'Dars: ' + x.lesson_title : 'Kurs haqida'));
                                const m = el('p', 'pg-muted', x.message); m.style.cssText = 'white-space:pre-wrap;margin:6px 0 8px'; it.appendChild(m);
                                const done = el('button', 'pg-btn ghost', 'Hal qilindi'); done.type = 'button';
                                done.addEventListener('click', async function () {
                                    done.disabled = true;
                                    try { await G.api.send('PATCH', '/ai-courses/' + c.id + '/reports/' + x.id, session, {}); it.remove(); c.reports = Math.max(0, (c.reports || 1) - 1); rep.textContent = 'Xato xabarlari' + (c.reports ? ' (' + c.reports + ')' : ''); }
                                    catch (e) { if (e.auth) throw e; done.disabled = false; G.toast('Bajarilmadi'); }
                                });
                                it.appendChild(done); repBox.appendChild(it);
                            });
                        } catch (e) { if (e.auth) throw e; repBox.appendChild(el('p', 'pg-muted', 'Yuklab bo\'lmadi.')); }
                    });
                    row.appendChild(rep); card.appendChild(row); card.appendChild(repBox);
                } else card.appendChild(row);
                card.appendChild(confirm); card.appendChild(body); listBox.appendChild(card);
            });
        }
        drawList();

        form.addEventListener('submit', async function (e) {
            e.preventDefault(); e.stopPropagation();
            if (go.disabled) return;
            go.disabled = true; msg.textContent = 'AI kurs yozmoqda... bu 1 daqiqagacha davom etishi mumkin.';
            try {
                const r = await G.api.send('POST', '/ai-courses', session, {
                    topic: topic.value, level: level.value, lessons: Number(lessons.value),
                    style: style.value, goal: goal.value
                });
                msg.textContent = 'Kurs tayyor. U hozircha faqat sizda.';
                topic.value = ''; style.value = ''; goal.value = '';
                const fresh = await G.api.get('/ai-courses', session);
                courses = fresh.courses; drawMeter(fresh); drawList();
                if (r.provider === 'demo') G.toast('Demo kurs yaratildi (AI hali ulanmagan)');
            } catch (err) {
                if (err.auth) throw err;
                go.disabled = false;
                if (err.status === 429 && err.data && typeof err.data.remaining === 'number') { drawMeter(err.data); msg.textContent = 'Bugungi kurslar tugadi. Ertaga davom etamiz.'; }
                else if (err.status === 429) msg.textContent = 'Oldingi kurs tayyorlanmoqda, kuting.';
                else if (err.data && err.data.code === 'EMAIL_NOT_VERIFIED') msg.textContent = 'Avval emailingizni tasdiqlang.';
                else if (err.status === 400) msg.textContent = 'Ma\'lumotni tekshiring: ' + err.message;
                else msg.textContent = 'AI hozir kurs yoza olmadi. Birozdan keyin qayta urinib ko\'ring.';
            }
        });
    });
    // ---- AI material creator: topic -> the AI asks general questions -> material to those conditions (private, "Mening materiallarim") ----
    G.register('ai-materials', async function (root, session) {
        root.textContent = '';
        const pg = el('div', 'pg'); root.appendChild(pg);
        const opts = await G.api.get('/ai-materials/options', session);
        const list = await G.api.get('/ai-materials', session);
        const status = await G.api.get('/ai/status', session);

        const head = el('div', 'pg-head'); const hd = el('div');
        hd.appendChild(el('h1', '', 'AI material yaratuvchi')); hd.appendChild(el('p', '', 'Mavzuni ayting, AI bir nechta savol beradi va materialni shartlaringizga moslab tayyorlaydi'));
        head.appendChild(hd); head.appendChild(el('span', 'pg-pill ' + (status.live ? '' : 'sky'), status.live ? 'AI faol' : 'Demo rejim'));
        pg.appendChild(head);
        pg.appendChild(notice(AI_WARN));

        const form = el('form', 'pg-card');
        const meter = el('b'); meter.style.display = 'block'; meter.style.marginBottom = '10px'; form.appendChild(meter);
        function field(label, node) { form.appendChild(el('label', 'pg-lbl', label)); form.appendChild(node); return node; }
        const topic = field('Mavzu', el('input', 'pg-input')); topic.maxLength = 200; topic.required = true; topic.placeholder = 'Masalan: React hooklari';
        const answers = {};
        opts.questions.forEach(function (q) {
            const sel = field(q.label, el('select', 'pg-input'));
            q.options.forEach(function (o) { const op = el('option', '', o); op.value = o; sel.appendChild(op); });
            answers[q.key] = sel;
        });
        const extra = field(opts.extraLabel, el('input', 'pg-input')); extra.maxLength = 300;
        const msg = el('p', 'pg-muted'); msg.style.minHeight = '1.2em';
        const go = el('button', 'pg-btn', 'Material yaratish'); go.type = 'submit'; go.style.marginTop = '14px';
        form.appendChild(go); form.appendChild(msg); pg.appendChild(form);

        const box = el('div'); box.style.marginTop = '18px'; pg.appendChild(box);
        let items = list.materials;
        function drawMeter(u) { meter.textContent = 'Bugun ' + u.remaining + ' ta material yaratish qoldi (' + u.limit + ' dan)'; go.disabled = u.remaining <= 0; }
        drawMeter(opts);

        function draw() {
            box.textContent = '';
            box.appendChild(el('h3', 'pg-h3', 'Mening materiallarim'));
            if (!items.length) { box.appendChild(el('p', 'pg-muted', 'Hozircha yo\'q. Yuqoridagi shakl orqali birinchi materialni yarating.')); return; }
            items.forEach(function (m) {
                const card = el('section', 'pg-card'); card.style.marginTop = '12px';
                const top = el('div'); top.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
                top.appendChild(el('span', 'pg-pill sun', 'Shaxsiy')); top.appendChild(el('span', 'pg-pill', m.kind));
                if (m.demo) top.appendChild(el('span', 'pg-pill sky', 'Demo'));
                card.appendChild(top);
                const h = el('h3', '', m.title); h.style.marginTop = '8px'; card.appendChild(h);
                card.appendChild(el('div', 'pg-muted', 'Gather Edu × ' + (session.name || 'siz')));
                const body = el('div', 'pg-muted'); body.hidden = true; body.style.cssText = 'white-space:pre-wrap;margin-top:12px';
                const row = el('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px';
                const open = el('button', 'pg-btn ghost', 'Ochish'); open.type = 'button';
                let loaded = false;
                open.addEventListener('click', async function () {
                    body.hidden = !body.hidden; open.textContent = body.hidden ? 'Ochish' : 'Yopish';
                    if (body.hidden || loaded) return;
                    try { const r = await G.api.get('/ai-materials/' + m.id, session); body.textContent = r.material.body + '\n\n— AI yaratgan material. Tekshirib foydalaning.'; loaded = true; }
                    catch (e) { if (e.auth) throw e; body.textContent = 'Materialni yuklab bo\'lmadi.'; }
                });
                row.appendChild(open);
                const del = el('button', 'pg-btn ghost', 'O\'chirish'); del.type = 'button';
                G.twice(del, 'Aniq o\'chiraymi?', async function () {
                    try { await G.api.send('DELETE', '/ai-materials/' + m.id, session); items = items.filter(function (x) { return x.id !== m.id; }); draw(); }
                    catch (e) { if (e.auth) throw e; G.toast('O\'chirib bo\'lmadi'); }
                });
                row.appendChild(del);
                card.appendChild(row); card.appendChild(body); box.appendChild(card);
            });
        }
        draw();

        form.addEventListener('submit', async function (e) {
            e.preventDefault(); e.stopPropagation();
            if (go.disabled) return;
            go.disabled = true; msg.textContent = 'AI material tayyorlamoqda... bu 1 daqiqagacha davom etishi mumkin.';
            const body = { topic: topic.value, extra: extra.value };
            Object.keys(answers).forEach(function (k) { body[k] = answers[k].value; });
            try {
                const r = await G.api.send('POST', '/ai-materials', session, body);
                msg.textContent = 'Material tayyor. U hozircha faqat sizda.'; topic.value = ''; extra.value = '';
                const fresh = await G.api.get('/ai-materials', session); items = fresh.materials; drawMeter(r); draw();
                if (r.provider === 'demo') G.toast('Demo material yaratildi (AI hali ulanmagan)');
            } catch (err) {
                if (err.auth) throw err;
                go.disabled = false;
                if (err.status === 429 && err.data && typeof err.data.remaining === 'number') { drawMeter(err.data); msg.textContent = 'Bugungi materiallar tugadi. Ertaga davom etamiz.'; }
                else if (err.status === 429) msg.textContent = 'Oldingi material tayyorlanmoqda, kuting.';
                else if (err.status === 400) msg.textContent = 'Ma\'lumotni tekshiring: ' + err.message;
                else msg.textContent = 'AI hozir material yoza olmadi. Birozdan keyin qayta urinib ko\'ring.';
            }
        });
    });
})();
