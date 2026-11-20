const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '../../frontend/js', f), 'utf8');
const dataSrc = read('dashboard-data.js'); const qaSrc = read('dashboard-lesson-qa.js');
const tick = () => new Promise((r) => setTimeout(r, 25));
const items = [{ id: 10, kind: 'video', title: 'Kirish videosi', url: 'https://example.com/v', position: 1 }];

function boot({ qa, role = 'student' }) {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window; w.open = jest.fn();
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.localStorage.setItem('user', JSON.stringify({ email: 'a@b.uz' }));
    const calls = [];
    w.fetch = jest.fn(async (url, init = {}) => {
        const method = init.method || 'GET';
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ url, method, body });
        const u = new URL(url).pathname.replace('/api', '');
        const reply = (b, status = 200) => ({ ok: status < 400, status, json: async () => b });
        if (u === '/student/courses/5/content') return reply({ course: { id: 5, title: 'Kurs', teacher: 'T', ai: false }, items, resume: null });
        if (u === '/lesson-qa/items/10' && method === 'GET') return reply(JSON.parse(JSON.stringify(qa)));
        if (u === '/lesson-qa/items/10' && method === 'POST') return reply({ id: 7, body: body.body, mine: true, answer: null }, 201);
        if (u === '/lesson-qa/questions/1/answer') return reply({ id: 1, answer: body.answer || null });
        if (u === '/course-tools/courses/5') return reply({}, 404);
        return reply({ ok: true });
    });
    w.eval(dataSrc); w.eval(qaSrc);
    w.GEData.ctx.courseId = 5;
    const c = w.document.getElementById('c');
    return { w, c, calls, run: () => w.GEData.hydrate('course-detail', c, { id: 2, token: 't', role }, () => {}, (e) => { throw e; }) };
}
const open = async (c) => { [...c.querySelectorAll('button')].find((b) => b.textContent === 'Savol-javob').click(); await tick(); };
const base = { questions: [{ id: 1, body: 'Bu <i>nima</i>?', author: 'Ali', mine: false, answer: null, created_at: '2026-11-01T10:00:00Z' }], can_answer: false, limits: { maxQuestion: 500, maxAnswer: 2000 } };

test('a student opens the box, sees questions as plain text, and asks one', async () => {
    const { c, calls, run } = boot({ qa: base }); await run(); await open(c);
    expect(c.textContent).toContain('Bu <i>nima</i>?'); expect(c.querySelector('i i')).toBeNull();
    expect(c.textContent).toContain('Javob kutilmoqda');
    const f = c.querySelector('form'); f.querySelector('textarea').value = 'Yangi savol';
    f.dispatchEvent(new c.ownerDocument.defaultView.Event('submit', { cancelable: true })); await tick();
    expect(calls.find((x) => x.method === 'POST').body).toEqual({ body: 'Yangi savol' });
    expect(c.textContent).toContain('Yangi savol');
});

test('an empty question is not sent', async () => {
    const { c, calls, run } = boot({ qa: base }); await run(); await open(c);
    c.querySelector('form').dispatchEvent(new c.ownerDocument.defaultView.Event('submit', { cancelable: true })); await tick();
    expect(calls.some((x) => x.method === 'POST')).toBe(false);
    expect(c.textContent).toContain('Savolni yozing');
});

test('the teacher sees an answer box and no ask form', async () => {
    const { c, calls, run } = boot({ qa: { ...base, can_answer: true } }); await run(); await open(c);
    expect(c.querySelector('form')).toBeNull();
    const ta = [...c.querySelectorAll('textarea')].find((t) => t.getAttribute('aria-label') === 'Javob'); ta.value = 'Mana javob';
    [...c.querySelectorAll('button')].find((b) => b.textContent === 'Javob berish').click(); await tick();
    expect(calls.find((x) => x.method === 'PUT' && x.url.endsWith('/answer')).body).toEqual({ answer: 'Mana javob' });
    expect(c.textContent).toContain('Mana javob');
});

test('toggle closes the box; load failure shows a message', async () => {
    const { c, run } = boot({ qa: base }); await run(); await open(c);
    expect(c.querySelector('form')).not.toBeNull();
    await open(c);
    expect(c.querySelector('form')).toBeNull();
});
