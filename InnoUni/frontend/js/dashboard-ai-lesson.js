/* AI lessons for students (real session only): the lesson list of an AI course with locks, and the lesson page
   (1. plan, 2. chat along the plan, 3. quiz of 10 questions; 8 right answers open the next lesson).
   Needs dashboard-data.js and dashboard-ai.js. Text via textContent only. */
(function () {
    'use strict';
    const G = window.GEData;
    if (!G) return;
    const el = G.el; const get = G.api.get; const send = G.api.send;

    const STATUS = { locked: ['Qulflangan', 'fas fa-lock'], open: ['Ochiq', 'fas fa-circle-play'], passed: ["O'tilgan", 'fas fa-circle-check'] };

    function openLesson(id) { G.ctx.lessonId = id; G.open('ai-lesson', 'courses'); }

    // The lessons of an AI course in order: a lesson opens when the one before it is passed
    G.aiLessonList = async function (course, session) {
        const box = el('div', 'pg-card'); box.style.marginTop = '14px';
        box.appendChild(el('h3', 'pg-h3', 'Darslar'));
        let data;
        try { data = await get('/ai-lessons/course/' + course.id, session); }
        catch (e) { if (e.auth) throw e; box.appendChild(el('p', 'pg-muted', 'Darslarni yuklab bo\'lmadi. Keyinroq urinib ko\'ring.')); return box; }
        const r = data.rules;
        const info = el('p', 'pg-muted', 'Har dars: avval AI reja beradi, so\'ng reja bo\'yicha dars o\'tiladi, oxirida ' + r.QUIZ_QUESTIONS + ' savolli test. Keyingi darsga o\'tish uchun kamida ' + r.PASS_SCORE + ' ta to\'g\'ri javob kerak.');
        box.appendChild(info);
        const bar = el('div', 'pg-bar'); const fill = document.createElement('i'); fill.style.width = (data.total ? Math.round(100 * data.passed / data.total) : 0) + '%'; bar.appendChild(fill);
        bar.style.margin = '10px 0'; box.appendChild(bar);
        box.appendChild(el('p', 'pg-muted', data.passed + ' / ' + data.total + ' dars tugatilgan'));
        box.current = data.lessons.find(function (l) { return l.status === 'open'; }) || null; // where "Davom ettirish" goes
        data.lessons.forEach(function (l, i) {
            const row = el('div', 'pg-lesson');
            row.appendChild(el('span', 'n', String(i + 1).padStart(2, '0')));
            const ic = el('i', STATUS[l.status][1]); ic.setAttribute('aria-hidden', 'true'); row.appendChild(ic);
            const t = el('div'); t.style.cssText = 'flex:1;min-width:0';
            t.appendChild(el('b', '', l.title));
            const sub = STATUS[l.status][0] + (l.score !== null ? ' · eng yaxshi natija: ' + l.score + '/' + r.QUIZ_QUESTIONS : '');
            t.appendChild(el('div', 'pg-muted', sub)); row.appendChild(t);
            const b = el('button', l.status === 'open' ? 'pg-btn' : 'pg-btn ghost', l.status === 'open' ? (l.score !== null ? 'Davom ettirish' : 'Darsni boshlash') : l.status === 'passed' ? 'Qayta ko\'rish' : 'Qulflangan');
            b.type = 'button';
            if (l.status === 'locked') { b.disabled = true; b.title = 'Avval oldingi darsni tugating'; }
            else b.addEventListener('click', function () { openLesson(l.id); });
            row.appendChild(b); box.appendChild(row);
        });
        return box;
    };

    G.register('ai-lesson', async function (root, session) {
        root.textContent = '';
        const pg = el('div', 'pg'); root.appendChild(pg);
        const id = G.ctx.lessonId;
        const back = el('button', 'pg-back'); back.type = 'button';
        back.appendChild(el('i', 'fas fa-arrow-left')); back.appendChild(document.createTextNode(' Kursga qaytish'));
        back.addEventListener('click', function () { G.open('course-detail', 'courses'); });
        pg.appendChild(back);
        if (!id) { pg.appendChild(el('p', 'pg-muted', 'Darsni kurs sahifasidan tanlang.')); return; }

        let d;
        try { d = await get('/ai-lessons/' + id, session); }
        catch (e) {
            if (e.auth) throw e;
            pg.appendChild(el('p', 'pg-muted', e.status === 409 ? 'Bu dars hali qulflangan. Avval oldingi darsni tugating.' : 'Dars topilmadi yoki sizga ochiq emas.'));
            return;
        }
        const rules = d.rules;
        let state = { plan: d.plan, talked: d.talked, quiz: d.quiz, remaining: d.remaining, limit: d.limit, status: d.status, best: d.best_score, attempts: d.attempts };

        // ---- head
        const hero = el('section', 'pg-card'); hero.style.marginTop = '14px';
        hero.appendChild(el('span', 'pg-pill sun', d.lesson.course_title));
        const h = el('h1', '', d.lesson.position + '-dars: ' + d.lesson.title); h.style.marginTop = '8px'; hero.appendChild(h);
        const steps = el('div', 'pg-meta'); steps.style.cssText = 'justify-content:flex-start;gap:6px 18px;margin-top:8px';
        const stepEls = ['1. Reja', '2. Dars (AI bilan suhbat)', '3. Test'].map(function (t) { const x = el('span', '', t); steps.appendChild(x); return x; });
        hero.appendChild(steps);
        const meter = el('p', 'pg-muted'); meter.style.marginTop = '8px'; hero.appendChild(meter);
        pg.appendChild(hero);
        pg.appendChild(G.aiNotice());
        function renderHead() {
            const stage = !state.plan ? 0 : state.talked < rules.MIN_CHAT_MESSAGES ? 1 : 2;
            stepEls.forEach(function (x, i) { x.style.fontWeight = i === stage ? '700' : '400'; x.style.opacity = i <= stage ? '1' : '.55'; x.style.color = i === stage ? 'var(--brand-ink)' : ''; });
            meter.textContent = 'Bugun ' + state.remaining + ' ta AI amali qoldi (' + state.limit + ' dan)';
        }

        // ---- lesson text (reference), with "report a mistake"
        const text = el('details', 'pg-card'); text.style.marginTop = '14px';
        text.appendChild(el('summary', '', 'Dars matni (o\'qib chiqing yoki AI bilan o\'ting)'));
        const body = el('div', 'pg-muted', d.lesson.body || ''); body.style.cssText = 'white-space:pre-wrap;margin-top:8px'; text.appendChild(body);
        if (G.reportBox) text.appendChild(G.reportBox(d.lesson.course_id, d.lesson.id, session));
        pg.appendChild(text);

        function problem(e, fallback) {
            if (e.status === 429 && e.data && typeof e.data.remaining === 'number') { state.remaining = e.data.remaining; renderHead(); return 'Bugungi AI amallari tugadi. Ertaga davom etamiz.'; }
            if (e.status === 429) return 'Oldingi javobni kuting.';
            if (e.status === 502) return 'AI hozir javob bermayapti. Birozdan keyin qayta urinib ko\'ring.';
            return fallback || 'Amalni bajarib bo\'lmadi. Qayta urinib ko\'ring.';
        }
        const note = function () { const m = el('p', 'pg-muted'); m.setAttribute('role', 'alert'); m.style.minHeight = '1.2em'; return m; };

        // ---- 1. plan
        const planCard = el('section', 'pg-card'); planCard.style.marginTop = '14px'; pg.appendChild(planCard);
        function drawPlan() {
            planCard.textContent = '';
            planCard.appendChild(el('h3', 'pg-h3', '1. Dars rejasi'));
            if (state.plan) { const p = el('div', '', state.plan); p.style.whiteSpace = 'pre-wrap'; planCard.appendChild(p); return; }
            planCard.appendChild(el('p', 'pg-muted', 'Avval AI shu dars uchun reja tuzadi. Keyin dars shu reja bo\'yicha o\'tiladi.'));
            const msg = note();
            const go = el('button', 'pg-btn', 'Dars rejasini olish'); go.type = 'button';
            go.addEventListener('click', async function () {
                go.disabled = true; go.textContent = 'Reja tuzilmoqda...'; msg.textContent = '';
                try {
                    const r = await send('POST', '/ai-lessons/' + id + '/plan', session);
                    state.plan = r.plan; state.remaining = r.remaining; state.limit = r.limit;
                    drawAll();
                } catch (e) { if (e.auth) throw e; msg.textContent = problem(e); go.disabled = false; go.textContent = 'Dars rejasini olish'; }
            });
            planCard.appendChild(go); planCard.appendChild(msg);
        }

        // ---- 2. chat along the plan
        const chatCard = el('section', 'pg-card pg-chat'); chatCard.style.marginTop = '14px'; pg.appendChild(chatCard);
        const msgsBox = el('div', 'pg-msgs'); msgsBox.setAttribute('aria-live', 'polite');
        let chatReady = false; let waiting = false;
        function bubble(t, cls) { const b = el('div', 'pg-msg ' + cls); b.style.whiteSpace = 'pre-wrap'; b.textContent = t; msgsBox.appendChild(b); msgsBox.scrollTop = msgsBox.scrollHeight; return b; }
        function drawChat() {
            chatCard.textContent = '';
            const hd = el('h3', 'pg-h3', '2. Dars: AI ustoz bilan suhbat'); hd.style.margin = '0 0 10px'; chatCard.appendChild(hd);
            if (!state.plan) { chatCard.appendChild(el('p', 'pg-muted', 'Reja olingach suhbat ochiladi.')); chatReady = false; return; }
            msgsBox.textContent = '';
            if (!d.messages.length) bubble('Reja tayyor. Tayyor bo\'lsangiz, 1-qadamdan boshlaymiz.', 'bot');
            d.messages.forEach(function (m) { bubble(m.content, m.role === 'assistant' ? 'bot' : 'me'); });
            d.messages = [];
            chatCard.appendChild(msgsBox);
            const sugg = el('div'); sugg.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:10px 0';
            ['Boshlaymiz', 'Keyingi qadam', 'Misol keltir', 'Tushunmadim, soddaroq tushuntir'].forEach(function (t) { const b = el('button', 'pg-chip', t); b.type = 'button'; b.addEventListener('click', function () { ask(t); }); sugg.appendChild(b); });
            chatCard.appendChild(sugg);
            const form = el('form', 'pg-send');
            const input = el('input', 'pg-input'); input.maxLength = 1000; input.placeholder = 'Javob yoki savolingizni yozing...'; input.setAttribute('aria-label', 'Xabar');
            const sendBtn = el('button'); sendBtn.type = 'submit'; sendBtn.setAttribute('aria-label', 'Yuborish'); sendBtn.appendChild(el('i', 'fas fa-paper-plane'));
            form.appendChild(input); form.appendChild(sendBtn); chatCard.appendChild(form);
            const prog = el('p', 'pg-muted'); prog.style.marginTop = '8px'; chatCard.appendChild(prog);
            function drawProg() {
                prog.textContent = state.talked >= rules.MIN_CHAT_MESSAGES
                    ? 'Test ochildi. Xohlasangiz suhbatni davom ettirishingiz mumkin.'
                    : 'Testni ochish uchun kamida ' + rules.MIN_CHAT_MESSAGES + ' ta xabar yozing: ' + state.talked + ' / ' + rules.MIN_CHAT_MESSAGES;
                input.disabled = sendBtn.disabled = state.remaining <= 0;
                if (state.remaining <= 0) input.placeholder = 'Bugungi AI amallari tugadi';
            }
            drawProg();
            ask = async function (t) {
                t = String(t || '').trim();
                if (!t || waiting || input.disabled) return;
                waiting = true; sendBtn.disabled = true;
                bubble(t, 'me');
                const typing = bubble('Ustoz yozmoqda...', 'bot'); typing.style.opacity = '.7';
                try {
                    const r = await send('POST', '/ai-lessons/' + id + '/chat', session, { message: t });
                    typing.style.opacity = ''; typing.textContent = r.reply;
                    state.talked += 1; state.remaining = r.remaining; state.limit = r.limit; input.value = '';
                    renderHead(); drawProg(); drawQuiz();
                } catch (e) { if (e.auth) throw e; typing.remove(); bubble(problem(e), 'bot'); }
                waiting = false; if (!input.disabled) sendBtn.disabled = false;
            };
            form.addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); ask(input.value); });
            chatReady = true;
        }
        let ask = function () {};

        // ---- 3. quiz
        const quizCard = el('section', 'pg-card'); quizCard.style.marginTop = '14px'; pg.appendChild(quizCard);
        function drawQuiz(result) {
            quizCard.textContent = '';
            quizCard.appendChild(el('h3', 'pg-h3', '3. Test: ' + rules.QUIZ_QUESTIONS + ' savol'));
            if (state.status === 'passed' && !result) {
                quizCard.appendChild(el('p', '', 'Bu dars tugatilgan' + (state.best !== null ? ' (eng yaxshi natija: ' + state.best + '/' + rules.QUIZ_QUESTIONS + ')' : '') + '.'));
                nextButtons(quizCard, d.next_lesson_id);
                return;
            }
            if (result) { drawResult(result); return; }
            quizCard.appendChild(el('p', 'pg-muted', 'Darsni tugatish uchun ' + rules.QUIZ_QUESTIONS + ' savoldan kamida ' + rules.PASS_SCORE + ' tasiga to\'g\'ri javob bering. Oldingi dars tugamaguncha keyingisi ochilmaydi.'));
            if (!state.plan || state.talked < rules.MIN_CHAT_MESSAGES) {
                quizCard.appendChild(el('p', 'pg-muted', 'Test hali yopiq: avval reja oling va AI ustoz bilan darsni o\'ting.'));
                return;
            }
            const msg = note();
            if (state.quiz) { drawQuestions(state.quiz); return; }
            const go = el('button', 'pg-btn', state.attempts ? 'Qayta urinish (yangi savollar)' : 'Testni boshlash'); go.type = 'button';
            go.addEventListener('click', async function () {
                go.disabled = true; go.textContent = 'Savollar tayyorlanmoqda...'; msg.textContent = '';
                try {
                    const r = await send('POST', '/ai-lessons/' + id + '/quiz', session);
                    state.quiz = r.quiz; state.remaining = r.remaining; state.limit = r.limit; renderHead(); drawQuiz();
                } catch (e) { if (e.auth) throw e; msg.textContent = problem(e, e.data && e.data.code === 'TALK_FIRST' ? 'Avval AI ustoz bilan yana suhbatlashing.' : null); go.disabled = false; go.textContent = state.attempts ? 'Qayta urinish (yangi savollar)' : 'Testni boshlash'; }
            });
            quizCard.appendChild(go); quizCard.appendChild(msg);
        }
        function drawQuestions(quiz) {
            const form = el('form'); form.noValidate = true;
            const picked = new Array(rules.QUIZ_QUESTIONS).fill(null);
            const submit = el('button', 'pg-btn', 'Javoblarni yuborish'); submit.type = 'submit'; submit.disabled = true;
            const count = el('p', 'pg-muted');
            function refresh() { const n = picked.filter(function (x) { return x !== null; }).length; count.textContent = 'Javob berildi: ' + n + ' / ' + quiz.questions.length; submit.disabled = n < quiz.questions.length; }
            quiz.questions.forEach(function (q, qi) {
                const fs = el('fieldset'); fs.style.cssText = 'border:0;padding:0;margin:0 0 18px';
                const lg = el('legend', '', (qi + 1) + '. ' + q.q); lg.style.cssText = 'font-weight:600;margin-bottom:8px;padding:0'; fs.appendChild(lg);
                q.options.forEach(function (o, oi) {
                    const lab = el('label'); lab.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border:1px solid var(--line);border-radius:10px;margin-bottom:6px;cursor:pointer';
                    const r = document.createElement('input'); r.type = 'radio'; r.name = 'q' + qi; r.value = String(oi); r.style.marginTop = '4px';
                    r.addEventListener('change', function () { picked[qi] = oi; refresh(); });
                    lab.appendChild(r); lab.appendChild(el('span', '', o)); fs.appendChild(lab);
                });
                form.appendChild(fs);
            });
            const msg = note();
            form.appendChild(count); form.appendChild(submit); form.appendChild(msg);
            form.addEventListener('submit', async function (e) {
                e.preventDefault(); e.stopPropagation();
                submit.disabled = true; submit.textContent = 'Tekshirilmoqda...'; msg.textContent = '';
                try {
                    const r = await send('POST', '/ai-lessons/' + id + '/quiz/submit', session, { quiz_id: quiz.id, answers: picked });
                    state.quiz = null; state.attempts += 1; state.best = Math.max(state.best || 0, r.score);
                    if (r.passed) { state.status = 'passed'; d.next_lesson_id = r.next_lesson_id; }
                    drawQuiz({ r: r, quiz: quiz, picked: picked });
                } catch (er) { if (er.auth) throw er; msg.textContent = 'Yuborib bo\'lmadi. Qayta urinib ko\'ring.'; submit.disabled = false; submit.textContent = 'Javoblarni yuborish'; }
            });
            quizCard.appendChild(form); refresh();
        }
        function nextButtons(card, nextId, finished) {
            const row = el('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:12px';
            if (nextId) { const n = el('button', 'pg-btn', 'Keyingi darsga o\'tish'); n.type = 'button'; n.addEventListener('click', function () { openLesson(nextId); }); row.appendChild(n); }
            const c = el('button', nextId ? 'pg-btn ghost' : 'pg-btn', finished ? 'Kursga qaytish' : 'Darslar ro\'yxati'); c.type = 'button';
            c.addEventListener('click', function () { G.open('course-detail', 'courses'); }); row.appendChild(c);
            card.appendChild(row);
        }
        function drawResult(x) {
            const r = x.r;
            const head = el('div', 'pg-card'); head.style.cssText = 'margin-bottom:14px;border-color:' + (r.passed ? 'var(--success, #2f9e6b)' : 'var(--danger, #d9534f)');
            head.setAttribute('role', 'status');
            const big = el('b', '', r.score + ' / ' + r.total); big.style.fontSize = '1.6rem'; head.appendChild(big);
            head.appendChild(el('p', '', r.passed
                ? (r.course_finished ? 'Tabriklaymiz! Siz kursning oxirgi darsini tugatdingiz.' : 'Dars tugatildi. Keyingi dars ochildi.')
                : 'Bu safar o\'tmadi: kamida ' + r.pass_score + ' ta to\'g\'ri javob kerak. Darsni takrorlab, yangi savollar bilan urinib ko\'ring.'));
            quizCard.appendChild(head);
            if (r.passed) nextButtons(quizCard, r.next_lesson_id, r.course_finished);
            else {
                const again = el('button', 'pg-btn', 'Qayta urinish (yangi savollar)'); again.type = 'button';
                again.addEventListener('click', function () { drawQuiz(); });
                quizCard.appendChild(again);
            }
            const det = el('details'); det.style.marginTop = '14px';
            det.appendChild(el('summary', '', 'Javoblar tahlili'));
            x.quiz.questions.forEach(function (q, i) {
                const it = r.results[i]; const box = el('div'); box.style.cssText = 'margin-top:12px;padding:10px 12px;border-radius:10px;border:1px solid var(--line)';
                box.appendChild(el('b', '', (i + 1) + '. ' + q.q));
                box.appendChild(el('div', 'pg-muted', (it.correct ? 'To\'g\'ri' : 'Noto\'g\'ri') + '. Sizning javobingiz: ' + (it.chosen === null ? 'yo\'q' : q.options[it.chosen])));
                if (!it.correct) box.appendChild(el('div', '', 'To\'g\'ri javob: ' + q.options[it.answer]));
                if (it.explanation) box.appendChild(el('div', 'pg-muted', it.explanation));
                det.appendChild(box);
            });
            quizCard.appendChild(det);
        }

        function drawAll() { renderHead(); drawPlan(); drawChat(); drawQuiz(); }
        drawAll();
    });
})();
