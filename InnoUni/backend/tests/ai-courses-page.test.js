const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const dataSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-data.js'), 'utf8');
const aiSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-ai.js'), 'utf8');

function boot(opts = {}) {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window;
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.localStorage.setItem('user', JSON.stringify({ email: 'a@b.uz' }));
    const calls = [];
    let courses = opts.courses || [{ id: 3, title: '<i>JS</i> kursi', description: 'Tavsif', public: false, demo: false, lessons: 2, students: 0 }];
    let remaining = opts.remaining === undefined ? 3 : opts.remaining;
    w.fetch = jest.fn(async (url, init = {}) => {
        const method = init.method || 'GET';
        calls.push({ url, method, body: init.body });
        const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
        if (url.endsWith('/ai/status')) return reply(200, { live: true, limit: 10, used: 0, remaining: 10 });
        if (url.endsWith('/ai-courses') && method === 'GET') return reply(200, { courses, limit: 3, used: 3 - remaining, remaining });
        if (url.endsWith('/ai-courses') && method === 'POST') {
            if (opts.failCreate) return reply(opts.failCreate, { error: 'x', code: opts.code });
            remaining -= 1; courses = [{ id: 9, title: 'Yangi', public: false, demo: true, lessons: 5, students: 0 }, ...courses];
            return reply(201, { courseId: 9, provider: 'demo' });
        }
        if (/\/ai-courses\/\d+$/.test(url) && method === 'GET') return reply(200, { course: {}, lessons: [{ id: 1, title: 'Kirish', body: '<b>Matn</b>' }] });
        if (method === 'PATCH') return reply(200, { public: true });
        if (method === 'DELETE') return reply(opts.deleteStatus || 200, { error: 'x' });
        return reply(404, {});
    });
    w.eval(dataSrc); w.eval(aiSrc);
    const c = w.document.getElementById('c');
    const session = { id: 1, token: 't', name: 'Sam Test', role: 'student' };
    return { w, c, calls, run: () => w.GEData.hydrate('ai-courses', c, session, () => {}, (e) => { throw e; }) };
}
const tick = () => new Promise((r) => setTimeout(r, 20));
const btn = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

test('shows the AI warning, the form, the counter and my courses as text with the shared credit', async () => {
    const { c, run } = boot();
    await run();
    expect(c.querySelector('[role=note]').textContent).toMatch(/AI xato qilishi mumkin.*Gather Edu javobgar emas/);
    expect(c.textContent).toContain('Bugun 3 ta kurs yaratish qoldi');
    expect(c.textContent).toContain('Gather Edu × Sam Test');
    expect(c.querySelector('section h3').textContent).toBe('<i>JS</i> kursi');
    expect(c.querySelector('section i')).toBeNull();
    expect(c.textContent).toContain('Shaxsiy');
});

test('creating sends the brief and refreshes the list', async () => {
    const { c, calls, run } = boot();
    await run();
    c.querySelector('input').value = 'Python asoslari';
    c.querySelector('form').dispatchEvent(new c.ownerDocument.defaultView.Event('submit', { cancelable: true }));
    await tick();
    const post = calls.find((x) => x.method === 'POST');
    expect(JSON.parse(post.body)).toMatchObject({ topic: 'Python asoslari', level: 'boshlang\'ich', lessons: 5 });
    expect(c.textContent).toContain('Yangi');
    expect(c.textContent).toContain('Bugun 2 ta kurs yaratish qoldi');
    expect([...c.querySelectorAll('.pg-pill')].some((p) => p.textContent === 'Demo')).toBe(true);
});

test('errors are explained; no credits left disables the button', async () => {
    const a = boot({ failCreate: 502 }); await a.run();
    a.c.querySelector('input').value = 'Python';
    a.c.querySelector('form').dispatchEvent(new a.w.Event('submit', { cancelable: true }));
    await tick();
    expect(a.c.textContent).toMatch(/AI hozir kurs yoza olmadi/);
    expect(btn(a.c, 'Kursni yaratish').disabled).toBe(false);
    const b = boot({ remaining: 0 }); await b.run();
    expect(btn(b.c, 'Kursni yaratish').disabled).toBe(true);
    const e = boot({ failCreate: 403, code: 'EMAIL_NOT_VERIFIED' }); await e.run();
    e.c.querySelector('input').value = 'Python';
    e.c.querySelector('form').dispatchEvent(new e.w.Event('submit', { cancelable: true }));
    await tick();
    expect(e.c.textContent).toMatch(/emailingizni tasdiqlang/);
});

test('lessons show as text; publish sends public:true; demo courses cannot be published', async () => {
    const { c, calls, run } = boot();
    await run();
    btn(c, 'Darslarni ko\'rish').click(); await tick();
    expect(c.querySelector('details summary').textContent).toBe('1. Kirish');
    expect(c.querySelector('details div').textContent).toBe('<b>Matn</b>');
    // making it public asks for a confirmation first: nothing is sent until the box is ticked
    btn(c, 'Public qilish').click(); await tick();
    expect(calls.some((x) => x.method === 'PATCH')).toBe(false);
    const yes = [...c.querySelectorAll('button')].filter((b) => b.textContent === 'Public qilish')[1];
    expect(yes.disabled).toBe(true);
    c.querySelector('input[type=checkbox]').checked = true;
    c.querySelector('input[type=checkbox]').dispatchEvent(new c.ownerDocument.defaultView.Event('change'));
    expect(yes.disabled).toBe(false);
    yes.click(); await tick();
    expect(JSON.parse(calls.find((x) => x.method === 'PATCH').body)).toEqual({ public: true, confirmed: true });
    expect(c.textContent).toContain('Public');
    const d = boot({ courses: [{ id: 4, title: 'Demo', public: false, demo: true, lessons: 3, students: 0 }] }); await d.run();
    expect(btn(d.c, 'Public qilish').disabled).toBe(true);
});

test('delete needs two clicks', async () => {
    const { c, calls, run } = boot();
    await run();
    btn(c, 'O\'chirish').click(); await tick();
    expect(calls.some((x) => x.method === 'DELETE')).toBe(false);
    btn(c, 'Aniq o\'chiraymi?').click(); await tick();
    expect(calls.some((x) => x.method === 'DELETE')).toBe(true);
    expect(c.textContent).toContain('Hozircha yo\'q');
});

test('student course page shows written lessons as text and hides empty video/guide boxes', async () => {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window;
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.localStorage.setItem('user', JSON.stringify({ email: 'a@b.uz' }));
    w.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ course: { id: 5, title: 'AI kurs', teacher: 'Gather Edu × Sam', ai: true }, items: [{ id: 1, kind: 'lesson', title: 'Kirish', body: '<u>Matn</u>', url: null }] }) }));
    w.eval(dataSrc);
    w.GEData.ctx.courseId = 5;
    const c = w.document.getElementById('c');
    await w.GEData.hydrate('course-detail', c, { id: 2, token: 't', role: 'student' }, () => {}, (e) => { throw e; });
    expect(c.textContent).toContain('Gather Edu × Sam');
    expect(c.querySelector('details summary').textContent).toBe('1. Kirish');
    expect(c.querySelector('details div').textContent).toBe('<u>Matn</u>');
    expect(c.textContent).not.toContain('Video darslar');
    expect(c.textContent).not.toContain('Qo\'llanmalar');
    expect(c.querySelector('[role=note]').textContent).toMatch(/AI yordamida yaratilgan/);
});
