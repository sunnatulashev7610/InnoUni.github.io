/* AI tutor page (real session only). Demo mode keeps the canned chat from pages/ai.html. Needs dashboard-data.js. Text via textContent only. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el;

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
        const note = el('p', 'pg-muted', 'AI xato qilishi mumkin. Muhim narsalarni o\'qituvchi yoki kurs materiallari bilan tekshiring.'); note.style.marginTop = '14px'; side.appendChild(note);
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
})();
