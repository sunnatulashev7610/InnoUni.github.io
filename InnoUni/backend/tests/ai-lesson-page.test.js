const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, 'frontend/js', f), 'utf8');
const dataSrc = read('dashboard-data.js'); const aiSrc = read('dashboard-ai.js'); const lessonSrc = read('dashboard-ai-lesson.js');
const rules = { QUIZ_QUESTIONS: 10, QUIZ_OPTIONS: 4, PASS_SCORE: 8, MIN_CHAT_MESSAGES: 3 };
const questions = Array.from({ length: 10 }, (_, i) => ({ q: i === 0 ? '<b>Savol</b> 1' : 'Savol ' + (i + 1), options: ['a', 'b', 'c', 'd'] }));

function boot(opts = {}) {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window;
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.localStorage.setItem('user', JSON.stringify({ email: 'a@b.uz' }));
    const calls = [];
    const st = { plan: opts.plan || null, talked: opts.talked || 0, quiz: opts.quiz || null, status: opts.status || 'open', msgs: opts.msgs || [], attempts: 0 };
    w.fetch = jest.fn(async (url, init = {}) => {
        const method = init.method || 'GET';
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ url, method, body });
        const reply = (status, b) => ({ ok: status < 400, status, json: async () => b });
        const u = new URL(url).pathname.replace('/api', '');
        if (u === '/ai-lessons/course/1') return reply(200, { course: { id: 1, title: 'JS' }, lessons: opts.lessons || [{ id: 11, title: 'Birinchi', position: 1, status: 'passed', score: 9 }, { id: 12, title: '<i>Ikkinchi</i>', position: 2, status: 'open', score: null }, { id: 13, title: 'Uchinchi', position: 3, status: 'locked', score: null }], passed: 1, total: 3, rules });
        if (u === '/ai-lessons/12' && method === 'GET') {
            if (opts.locked) return reply(409, { error: 'x', code: 'LESSON_LOCKED' });
            return reply(200, { lesson: { id: 12, title: 'Ikkinchi', body: '<b>Dars</b> matni', position: 2, course_id: 1, course_title: 'JS' }, status: st.status, plan: st.plan, messages: st.msgs, talked: st.talked, quiz: st.quiz, attempts: st.attempts, best_score: null, next_lesson_id: 13, live: true, rules, limit: 40, used: 0, remaining: 40 });
        }
        if (u === '/ai-lessons/12/plan') { if (opts.failPlan) return reply(502, { error: 'x' }); st.plan = '1. Kirish: nima'; return reply(200, { plan: st.plan, limit: 40, used: 1, remaining: 39 }); }
        if (u === '/ai-lessons/12/chat') { st.talked++; return reply(200, { reply: '<i>Javob</i> ' + st.talked, limit: 40, used: 2, remaining: 38 }); }
        if (u === '/ai-lessons/12/quiz') { if (opts.talkFirst) return reply(409, { error: 'x', code: 'TALK_FIRST' }); st.quiz = { id: 5, questions }; return reply(201, { quiz: st.quiz, limit: 40, used: 3, remaining: 37 }); }
        if (u === '/ai-lessons/12/quiz/submit') {
            const right = opts.score === undefined ? 9 : opts.score;
            return reply(200, { score: right, total: 10, pass_score: 8, passed: right >= 8, results: questions.map((q, i) => ({ correct: i < right, answer: 2, chosen: body.answers[i], explanation: i === 0 ? '<u>Izoh</u>' : '' })), course_finished: false, next_lesson_id: right >= 8 ? 13 : null });
        }
        return reply(404, {});
    });
    w.eval(dataSrc); w.eval(aiSrc); w.eval(lessonSrc);
    const c = w.document.getElementById('c');
    const session = { id: 1, token: 't', name: 'Sam', role: 'student' };
    w.GEData.ctx.lessonId = 12;
    return { w, c, calls, st, list: () => w.GEData.aiLessonList({ id: 1 }, session), run: () => w.GEData.hydrate('ai-lesson', c, session, () => {}, (e) => { throw e; }) };
}
const tick = () => new Promise((r) => setTimeout(r, 25));
const btn = (c, t) => [...c.querySelectorAll('button')].find((b) => b.textContent === t);
const submit = (w, form) => form.dispatchEvent(new w.Event('submit', { cancelable: true }));
const pickAll = (w, c, n = 10) => { for (let i = 0; i < n; i++) { const r = c.querySelector(`input[name=q${i}]`); r.checked = true; r.dispatchEvent(new w.Event('change')); } };

describe('lesson list', () => {
    test('shows each lesson state: passed with score, open, locked (disabled button); text only', async () => {
        const { list } = boot(); const box = await list();
        expect(box.textContent).toContain('1 / 3 dars tugatilgan');
        expect(box.textContent).toContain('eng yaxshi natija: 9/10');
        expect(box.textContent).toContain('kamida 8 ta to\'g\'ri javob');
        const rows = [...box.querySelectorAll('.pg-lesson')];
        expect(rows).toHaveLength(3);
        expect(rows[1].textContent).toContain('<i>Ikkinchi</i>'); expect(rows[1].querySelector('b i')).toBeNull();
        expect(btn(rows[1], 'Darsni boshlash')).toBeTruthy();
        const locked = btn(rows[2], 'Qulflangan'); expect(locked.disabled).toBe(true);
    });
    test('opening a lesson sets it in the context', async () => {
        const { w, list } = boot(); w.GEData.open = jest.fn();
        const box = await list(); btn(box, 'Darsni boshlash').click();
        expect(w.GEData.ctx.lessonId).toBe(12); expect(w.GEData.open).toHaveBeenCalledWith('ai-lesson', 'courses');
    });
});

describe('lesson page', () => {
    test('a locked lesson explains itself', async () => {
        const { c, run } = boot({ locked: true }); await run();
        expect(c.textContent).toContain('hali qulflangan');
    });
    test('step 1: plan first; chat and quiz stay closed; the plan button gets the plan', async () => {
        const { c, calls, run } = boot(); await run();
        expect(c.textContent).toContain('Dars rejasini olish');
        expect(c.textContent).toContain('Reja olingach suhbat ochiladi');
        expect(c.textContent).toContain('Test hali yopiq');
        expect(c.textContent).toContain('Bugun 40 ta AI amali qoldi');
        btn(c, 'Dars rejasini olish').click(); await tick();
        expect(calls.some((x) => x.url.endsWith('/ai-lessons/12/plan') && x.method === 'POST')).toBe(true);
        expect(c.textContent).toContain('1. Kirish: nima');
        expect(c.querySelector('.pg-send')).toBeTruthy();
    });
    test('a failed plan is explained and can be retried', async () => {
        const { c, run } = boot({ failPlan: true }); await run();
        btn(c, 'Dars rejasini olish').click(); await tick();
        expect(c.textContent).toContain('AI hozir javob bermayapti');
        expect(btn(c, 'Dars rejasini olish').disabled).toBe(false);
    });
    test('step 2: messages go to the lesson chat as text; the quiz opens after 3 messages', async () => {
        const { w, c, calls, run } = boot({ plan: 'Reja', msgs: [{ role: 'assistant', content: '<b>Salom</b>' }] }); await run();
        expect(c.querySelector('.pg-msgs').textContent).toContain('<b>Salom</b>'); expect(c.querySelector('.pg-msgs b')).toBeNull();
        expect(c.textContent).toContain('0 / 3');
        const input = c.querySelector('.pg-send input');
        for (let i = 0; i < 3; i++) { input.value = 'savol ' + i; submit(w, c.querySelector('.pg-send')); await tick(); }
        expect(calls.filter((x) => x.url.endsWith('/chat')).map((x) => x.body.message)).toEqual(['savol 0', 'savol 1', 'savol 2']);
        expect(c.querySelector('.pg-msgs').textContent).toContain('<i>Javob</i> 3'); expect(c.querySelector('.pg-msgs i')).toBeNull();
        expect(c.textContent).toContain('Test ochildi');
        expect(btn(c, 'Testni boshlash')).toBeTruthy();
    });
    test('step 3: quiz shows 10 questions as text, submit needs all answers, sends them, shows the pass and the next lesson', async () => {
        const { w, c, calls, run } = boot({ plan: 'Reja', talked: 3 }); w.GEData.open = jest.fn(); await run();
        btn(c, 'Testni boshlash').click(); await tick();
        expect(c.querySelectorAll('fieldset')).toHaveLength(10);
        expect(c.querySelector('legend').textContent).toBe('1. <b>Savol</b> 1'); expect(c.querySelector('legend b')).toBeNull();
        const send = btn(c, 'Javoblarni yuborish'); expect(send.disabled).toBe(true);
        pickAll(w, c, 9); expect(send.disabled).toBe(true); expect(c.textContent).toContain('9 / 10');
        pickAll(w, c, 10); expect(send.disabled).toBe(false);
        submit(w, c.querySelector('fieldset').closest('form')); await tick();
        const sent = calls.find((x) => x.url.endsWith('/quiz/submit'));
        expect(sent.body.quiz_id).toBe(5); expect(sent.body.answers).toHaveLength(10);
        expect(c.textContent).toContain('9 / 10'); expect(c.textContent).toContain('Keyingi dars ochildi');
        expect(c.querySelector('details u')).toBeNull();
        btn(c, 'Keyingi darsga o\'tish').click();
        expect(w.GEData.ctx.lessonId).toBe(13); expect(w.GEData.open).toHaveBeenCalledWith('ai-lesson', 'courses');
    });
    test('a failed quiz does not open the next lesson and offers a retry with new questions', async () => {
        const { w, c, run } = boot({ plan: 'Reja', talked: 3, score: 7 }); await run();
        btn(c, 'Testni boshlash').click(); await tick(); pickAll(w, c);
        submit(w, c.querySelector('fieldset').closest('form')); await tick();
        expect(c.textContent).toContain('7 / 10'); expect(c.textContent).toContain('o\'tmadi');
        expect(btn(c, 'Keyingi darsga o\'tish')).toBeUndefined();
        expect(btn(c, 'Qayta urinish (yangi savollar)')).toBeTruthy();
        expect(c.textContent).toContain('Javoblar tahlili');
    });
    test('quiz stays closed until enough talking; the server saying TALK_FIRST is explained', async () => {
        const closed = boot({ plan: 'Reja', talked: 1 }); await closed.run();
        expect(btn(closed.c, 'Testni boshlash')).toBeUndefined();
        const { c, run } = boot({ plan: 'Reja', talked: 3, talkFirst: true }); await run();
        btn(c, 'Testni boshlash').click(); await tick();
        expect(c.textContent).toContain('yana suhbatlashing');
    });
    test('an unfinished quiz is shown again after reload', async () => {
        const { c, run } = boot({ plan: 'Reja', talked: 3, quiz: { id: 5, questions } }); await run();
        expect(c.querySelectorAll('fieldset')).toHaveLength(10);
    });
    test('a passed lesson shows its result and the way forward', async () => {
        const { c, run } = boot({ plan: 'Reja', talked: 3, status: 'passed' }); await run();
        expect(c.textContent).toContain('Bu dars tugatilgan');
        expect(btn(c, 'Keyingi darsga o\'tish')).toBeTruthy();
    });
});
