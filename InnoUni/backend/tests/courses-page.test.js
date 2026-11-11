const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../frontend/js/dashboard-data.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../../secondary-pages/dashboard/pages/courses.html'), 'utf8');
const session = { id: 5, token: 'tok', name: 'Ali', role: 'student' };

const base = () => [
    { id: 1, title: 'React va Next', description: 'd', category: 'Frontend', teacher: 'Malika', students: 3, enrolled: true, progress: 40 },
    { id: 2, title: '<img src=x onerror=alert(1)>', description: null, category: 'Backend', teacher: null, students: 0, enrolled: false, progress: 0 }
];

let win; let doc; let posts;
function setup(courses, opts = {}) {
    const dom = new JSDOM('<!doctype html><body>' + page + '</body>', { runScripts: 'outside-only' });
    win = dom.window; doc = win.document; posts = [];
    win.config = { apiBaseUrl: 'https://api.test/api' };
    win.fetch = jest.fn(async (url, init = {}) => {
        if (init.method === 'POST') {
            posts.push(url);
            if (opts.enrollError) return { ok: false, status: 400, json: async () => ({ error: opts.enrollError }) };
            return { ok: true, status: 200, json: async () => ({ message: 'ok' }) };
        }
        return { ok: true, status: 200, json: async () => ({ courses }) };
    });
    win.eval(src);
}
const run = () => win.GEData.hydrate('courses', doc.body, session, () => {}, (e) => { throw e; });
const flush = () => new Promise((r) => setTimeout(r, 0));
const titles = () => [...doc.querySelectorAll('#pgFilterTarget h3')].map((h) => h.textContent);

test('renders real courses, removes the create button, adds filters', async () => {
    setup(base());
    await run();
    expect(titles()).toHaveLength(2);
    expect(doc.body.textContent).not.toContain('Yangi kurs');
    expect([...doc.querySelectorAll('.pg-chip')].map((c) => c.textContent)).toEqual(['Hammasi', 'Mening kurslarim', 'Frontend', 'Backend']);
    expect(doc.querySelector('.pg-bar')).not.toBeNull();       // only the enrolled one has progress
    expect(doc.querySelectorAll('.pg-bar').length).toBe(1);
    expect(win.fetch.mock.calls[0][0]).toBe('https://api.test/api/student/courses');
});

test('hostile titles are text only', async () => {
    setup(base());
    await run();
    expect(doc.querySelectorAll('#pgFilterTarget img').length).toBe(0);
    expect(titles()[1]).toContain('<img');
});

test('"Mening kurslarim" and category filters', async () => {
    setup(base());
    await run();
    [...doc.querySelectorAll('.pg-chip')].find((c) => c.textContent === 'Mening kurslarim').click();
    expect(titles()).toEqual(['React va Next']);
    [...doc.querySelectorAll('.pg-chip')].find((c) => c.textContent === 'Backend').click();
    expect(titles()).toHaveLength(1);
    expect(titles()[0]).toContain('<img');
});

test('enrolling calls the API and turns the card into an enrolled one', async () => {
    setup(base());
    await run();
    [...doc.querySelectorAll('.pg-btn')].find((b) => b.textContent === 'Yozilish').click();
    await flush();
    expect(posts).toEqual(['https://api.test/api/student/courses/2/enroll']);
    expect(doc.querySelectorAll('.pg-bar').length).toBe(2);
    expect([...doc.querySelectorAll('.pg-btn')].some((b) => b.textContent === 'Yozilish')).toBe(false);
});

test('a failed enrol shows a message and keeps the button usable', async () => {
    setup(base(), { enrollError: 'Already enrolled in this course' });
    await run();
    const btn = [...doc.querySelectorAll('.pg-btn')].find((b) => b.textContent === 'Yozilish');
    btn.click();
    await flush();
    expect(btn.textContent).toBe('Allaqachon yozilgansiz');
    expect(btn.disabled).toBe(false);
});

test('no courses shows a hint', async () => {
    setup([]);
    await run();
    expect(doc.querySelector('#pgFilterTarget').textContent).toMatch(/Hozircha kurslar yo'q/);
});
