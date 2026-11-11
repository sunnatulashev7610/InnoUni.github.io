const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const dataSrc = read('frontend/js/dashboard-data.js');
const teacherSrc = read('frontend/js/dashboard-teacher.js');
const session = { id: 2, token: 'tok', name: 'Malika', role: 'teacher' };

let win; let doc; let calls; let store;
function setup(initial) {
    store = { courses: initial.courses || [], course: initial.course, items: initial.items || [] };
    const dom = new JSDOM('<!doctype html><body><div id="c"><div class="pg"></div></div></body>', { runScripts: 'outside-only' });
    win = dom.window; doc = win.document; calls = [];
    win.config = { apiBaseUrl: 'https://api.test/api' };
    win.loadPage = jest.fn();
    win.fetch = jest.fn(async (url, init = {}) => {
        const method = init.method || 'GET';
        const body = init.body ? JSON.parse(init.body) : undefined;
        calls.push({ method, url: url.replace('https://api.test/api', ''), body });
        const u = url.replace('https://api.test/api', '');
        if (store.fail && method !== 'GET') return { ok: false, status: 400, json: async () => ({ error: store.fail }) };
        if (method === 'GET' && u === '/teacher/courses') return { ok: true, status: 200, json: async () => ({ courses: store.courses }) };
        if (method === 'GET' && /\/content$/.test(u)) return { ok: true, status: 200, json: async () => ({ course: store.course, items: store.items }) };
        if (method === 'POST' && u === '/teacher/courses') return { ok: true, status: 201, json: async () => ({ courseId: 9 }) };
        if (method === 'POST' && /\/content$/.test(u)) { store.items.push({ id: 50, kind: body.kind, title: body.title, url: body.url }); return { ok: true, status: 201, json: async () => ({}) }; }
        return { ok: true, status: 200, json: async () => ({}) };
    });
    win.eval(dataSrc); win.eval(teacherSrc);
}
const run = (page) => win.GEData.hydrate(page, doc.getElementById('c'), session, () => { throw new Error('auth'); }, (e) => { throw e; });
const flush = () => new Promise((r) => setTimeout(r, 0));
const submit = (f) => f.dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
const byText = (sel, t) => [...doc.querySelectorAll(sel)].find((n) => n.textContent.includes(t));

const course = (o = {}) => ({ id: 1, title: 'Python', category: 'Backend', description: 'd', status: 'inactive', videos: 0, guides: 0, students: 0, ...o });

test('list shows counts, status and an empty state', async () => {
    setup({ courses: [course({ videos: 2, guides: 1, students: 4, status: 'active' }), course({ id: 2, title: '<img src=x onerror=1>' })] });
    await run('t-courses');
    expect(doc.querySelectorAll('article').length).toBe(2);
    expect(doc.body.textContent).toContain('2 video');
    expect(doc.body.textContent).toContain('Nashr etilgan');
    expect(doc.body.textContent).toContain('Qoralama');
    expect(doc.querySelectorAll('img').length).toBe(0);
    byText('.pg-chip', 'Qoralama').click();
    expect(doc.querySelectorAll('article').length).toBe(1);
    setup({ courses: [] });
    await run('t-courses');
    expect(doc.body.textContent).toContain('Hali kurs yaratmagansiz');
});

test('publish toggle calls the API, and shows a hint when the course is empty', async () => {
    setup({ courses: [course()] });
    await run('t-courses');
    store.fail = 'Add at least one content item before publishing';
    byText('button', "E'lon qilish").click(); await flush();
    expect(doc.body.textContent).toContain('Avval kamida bitta');
    store.fail = null;
    byText('button', "E'lon qilish").click(); await flush();
    expect(calls.find((c) => c.method === 'PUT').body).toEqual({ status: 'active' });
    expect(doc.body.textContent).toContain('Yashirish');
});

test('create form posts and opens the editor', async () => {
    setup({});
    await run('t-create');
    doc.getElementById('cTitleReal').value = 'Yangi';
    submit(doc.querySelector('form')); await flush();
    expect(calls.find((c) => c.method === 'POST').body.title).toBe('Yangi');
    expect(win.GEData.ctx.courseId).toBe(9);
    expect(win.loadPage.mock.calls[0][0]).toBe('t-course-edit');
});

test('create form blocks an empty title', async () => {
    setup({});
    await run('t-create');
    submit(doc.querySelector('form')); await flush();
    expect(calls.filter((c) => c.method === 'POST').length).toBe(0);
    expect(doc.body.textContent).toContain('Kurs nomini kiriting');
});

test('editor lists items by kind, adds, moves and deletes', async () => {
    setup({ course: course(), items: [{ id: 5, kind: 'video', title: 'V1', url: 'https://y.be/1' }, { id: 6, kind: 'video', title: 'V2', url: 'https://y.be/2' }] });
    win.GEData.ctx.courseId = 1;
    await run('t-course-edit');
    expect(doc.body.textContent).toContain('Video darslar');
    expect(doc.querySelectorAll('a[rel="noopener noreferrer"]').length).toBe(2);
    // first "up" and last "down" are disabled
    expect(doc.querySelector('[aria-label="Yuqoriga"]').disabled).toBe(true);

    doc.getElementById('addKind').value = 'guide';
    doc.getElementById('addTitle').value = 'PDF';
    doc.getElementById('addUrl').value = 'https://x.uz/a.pdf';
    submit(doc.getElementById('addUrl').closest('form')); await flush(); await flush();
    expect(calls.find((c) => c.method === 'POST' && /content$/.test(c.url)).body).toEqual({ kind: 'guide', title: 'PDF', url: 'https://x.uz/a.pdf' });
    expect(doc.body.textContent).toContain('PDF');

    [...doc.querySelectorAll('[aria-label="Pastga"]')][0].click(); await flush();
    expect(calls.find((c) => /move$/.test(c.url)).body).toEqual({ direction: 'down' });
    doc.querySelector('[aria-label="O\'chirish"]').click(); await flush();
    expect(calls.some((c) => c.method === 'DELETE' && c.url === '/teacher/courses/1/content/5')).toBe(true);
});

test('editor saves info and publishes with an error hint for empty courses', async () => {
    setup({ course: course(), items: [] });
    win.GEData.ctx.courseId = 1;
    await run('t-course-edit');
    doc.getElementById('eTitle').value = 'Nom';
    submit(doc.getElementById('eTitle').closest('form')); await flush();
    expect(calls.find((c) => c.method === 'PUT').body.title).toBe('Nom');
    store.fail = 'x';
    byText('button', "E'lon qilish").click(); await flush();
    expect(doc.body.textContent).toContain('Avval kamida bitta');
});

test('editor without a chosen course returns to the list', async () => {
    setup({});
    await run('t-course-edit');
    expect(win.loadPage.mock.calls[0][0]).toBe('t-courses');
});
