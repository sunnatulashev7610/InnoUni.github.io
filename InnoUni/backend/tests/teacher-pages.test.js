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

describe('teacher tasks and grading page', () => {
    let tcalls;
    async function setupT() {
        const dom = new JSDOM('<!doctype html><body><div id="c"><p>demo</p></div></body>', { runScripts: 'outside-only' });
        win = dom.window; doc = win.document; tcalls = [];
        win.config = { apiBaseUrl: 'https://api.test/api' };
        win.fetch = jest.fn(async (url, init = {}) => {
            const u = url.replace('https://api.test/api', ''); const m = init.method || 'GET';
            tcalls.push({ m, u, body: init.body && JSON.parse(init.body) });
            const ok = (j) => ({ ok: true, status: 200, json: async () => j });
            if (u === '/teacher/courses') return ok({ courses: [{ id: 10, title: 'Python', status: 'active', videos: 1, guides: 0, students: 2 }] });
            if (/\/courses\/10\/tasks$/.test(u)) return ok({ tasks: [{ id: 7, title: 'Essay', dueDate: '2026-12-01', submitted: 1, graded: 0, students: 2 }] });
            if (/\/tasks\/7\/submissions$/.test(u)) return ok([{ id: 1, student_id: 5, student_name: '<b>Ali</b>', content: 'javob', status: 'submitted', grade: null, feedback: null }]);
            return ok({});
        });
        win.eval(dataSrc); win.eval(teacherSrc);
        await win.GEData.hydrate('t-grading', doc.getElementById('c'), session, () => {}, (e) => { throw e; });
    }
    test('shows tasks with counts, creates a course task', async () => {
        await setupT();
        expect(doc.body.textContent).not.toContain('demo');
        expect(doc.body.textContent).toContain('1/2 topshirgan');
        doc.getElementById('tgTitle').value = 'Yangi';
        doc.getElementById('tgDue').value = '2026-12-05';
        doc.getElementById('tgTitle').closest('form').dispatchEvent(new win.Event('submit', { cancelable: true }));
        await flush();
        expect(tcalls.find((c) => c.m === 'POST' && c.u === '/teacher/tasks').body).toMatchObject({ course_id: 10, title: 'Yangi', due_date: '2026-12-05' });
    });
    test('blocks an empty title; opens answers as text and grades with student_id', async () => {
        await setupT();
        doc.getElementById('tgTitle').closest('form').dispatchEvent(new win.Event('submit', { cancelable: true }));
        await flush();
        expect(doc.body.textContent).toContain('Vazifa nomini kiriting');
        byText('button', 'Javoblar').click(); await flush(); await flush();
        expect([...doc.querySelectorAll('b')].every((n) => n.children.length === 0)).toBe(true); // markup was not parsed
        expect(doc.body.textContent).toContain('<b>Ali</b>');
        const gf = doc.querySelector('[aria-label="Baho"]').closest('form');
        doc.querySelector('[aria-label="Baho"]').value = '150';
        gf.dispatchEvent(new win.Event('submit', { cancelable: true })); await flush();
        expect(doc.body.textContent).toContain('0 dan 100 gacha');
        doc.querySelector('[aria-label="Baho"]').value = '88';
        gf.dispatchEvent(new win.Event('submit', { cancelable: true })); await flush();
        expect(tcalls.find((c) => /grade$/.test(c.u)).body).toEqual({ grade: 88, feedback: '', student_id: 5 });
    });
});
