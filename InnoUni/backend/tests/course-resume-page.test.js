const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '../../frontend/js', f), 'utf8');
const dataSrc = read('dashboard-data.js'); const lessonSrc = read('dashboard-ai-lesson.js');
const tick = () => new Promise((r) => setTimeout(r, 25));
const btn = (c, starts) => [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith(starts));
const items = [
    { id: 10, kind: 'video', title: 'Kirish videosi', url: 'https://example.com/v', position: 1 },
    { id: 11, kind: 'video', title: 'Ikkinchi video', url: 'https://example.com/v2', position: 2 },
    { id: 12, kind: 'guide', title: 'Qo\'llanma', url: 'https://example.com/g', position: 3 }
];

function boot({ course = { id: 5, title: 'Kurs', teacher: 'T', ai: false }, content = items, resume = null, lessons } = {}) {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window; w.open = jest.fn();
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.localStorage.setItem('user', JSON.stringify({ email: 'a@b.uz' }));
    const calls = [];
    w.fetch = jest.fn(async (url, init = {}) => {
        const method = init.method || 'GET';
        calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
        const u = new URL(url).pathname.replace('/api', '');
        const reply = (b) => ({ ok: true, status: 200, json: async () => b });
        if (u === '/student/courses/5/content') return reply({ course, items: content, resume });
        if (u === '/ai-lessons/course/5') return reply({ course: { id: 5, title: 'Kurs' }, lessons, passed: 1, total: 2, rules: { QUIZ_QUESTIONS: 10, PASS_SCORE: 8 } });
        return reply({ ok: true });
    });
    w.eval(dataSrc); w.eval(lessonSrc);
    w.GEData.ctx.courseId = 5;
    const c = w.document.getElementById('c');
    return { w, c, calls, run: () => w.GEData.hydrate('course-detail', c, { id: 2, token: 't', role: 'student' }, () => {}, (e) => { throw e; }) };
}

test('no history: the button starts the first item, opening an item remembers it', async () => {
    const { w, c, calls, run } = boot(); await run();
    const go = btn(c, 'Boshlash: ');
    expect(go.textContent).toBe('Boshlash: Kirish videosi');
    go.click(); await tick();
    const put = calls.find((x) => x.method === 'PUT');
    expect(put.url).toBe('https://api.test/api/student/courses/5/resume'); expect(put.body).toEqual({ item_id: 10 });
    expect(c.querySelector('button.pg-btn.sun').textContent).toBe('Davom ettirish: Kirish videosi');
    expect(w.open).toHaveBeenCalled();
});

test('with history: the button continues from the last item and it is marked', async () => {
    const { c, calls, run } = boot({ resume: 11 }); await run();
    expect(btn(c, 'Davom ettirish: ').textContent).toBe('Davom ettirish: Ikkinchi video');
    const shown = [...c.querySelectorAll('[data-last-item]')].filter((n) => !n.hidden);
    expect(shown.map((n) => n.dataset.lastItem)).toEqual(['11']);
    expect(calls.some((x) => x.method === 'PUT')).toBe(false);
    // opening another item moves the mark
    [...c.querySelectorAll('.pg-lesson button')].find((b, i) => i === 0).click(); await tick();
    expect([...c.querySelectorAll('[data-last-item]')].filter((n) => !n.hidden).map((n) => n.dataset.lastItem)).toEqual(['10']);
});

test('a written lesson: opening it remembers it', async () => {
    const { c, calls, run } = boot({ content: [{ id: 20, kind: 'lesson', title: 'Matn darsi', body: 'x', position: 1 }] }); await run();
    const d = c.querySelector('details'); d.open = true; d.dispatchEvent(new c.ownerDocument.defaultView.Event('toggle')); await tick();
    expect(calls.find((x) => x.method === 'PUT').body).toEqual({ item_id: 20 });
});

test('an AI course continues with the first lesson that is not passed', async () => {
    const { w, c, run } = boot({ course: { id: 5, title: 'AI', teacher: 'T', ai: true }, content: [{ id: 30, kind: 'lesson', title: 'L', body: null, position: 1 }], lessons: [{ id: 30, title: 'Birinchi', position: 1, status: 'passed', score: 9 }, { id: 31, title: 'Ikkinchi', position: 2, status: 'open', score: null }] });
    w.GEData.open = jest.fn(); await run();
    const go = btn(c, 'Boshlash: ');
    expect(go.textContent).toBe('Boshlash: Ikkinchi');
    go.click();
    expect(w.GEData.ctx.lessonId).toBe(31); expect(w.GEData.open).toHaveBeenCalledWith('ai-lesson', 'courses');
});

test('an empty course has no resume button', async () => {
    const { c, run } = boot({ content: [] }); await run();
    expect(btn(c, 'Boshlash: ')).toBeUndefined(); expect(btn(c, 'Davom ettirish: ')).toBeUndefined();
});
