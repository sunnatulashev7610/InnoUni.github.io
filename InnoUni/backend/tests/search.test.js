const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../..');
const dataSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-data.js'), 'utf8');
const searchSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-search.js'), 'utf8');

const answers = {
    '/student/courses': { courses: [{ id: 1, title: 'JavaScript asoslari', category: 'Dasturlash', teacher: 'Ali' }, { id: 2, title: '<img src=x onerror=alert(1)>', category: 'Dizayn' }] },
    '/student/tasks': { tasks: [{ id: 9, title: 'Funksiyalar', course: 'JavaScript asoslari' }] },
    '/groups': { groups: [{ id: 4, name: "O'quv guruhi" }] },
    '/teacher/courses': { courses: [{ id: 5, title: 'Python', category: 'Dasturlash' }] },
};
let windows = [];
function boot(role, failing) {
    const dom = new JSDOM('<!doctype html><body><div class="search-bar"><input type="text"></div><div id="c"></div></body>', { runScripts: 'outside-only' });
    windows.push(dom.window);
    const w = dom.window;
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.fetch = jest.fn(async (url) => {
        const key = Object.keys(answers).find((k) => url.includes(k));
        if (failing && url.includes(failing)) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => answers[key] || {} };
    });
    w.eval(dataSrc); w.eval(searchSrc);
    w.loadPage = jest.fn();
    w.GEData.search.start({ token: 't', role });
    const input = w.document.querySelector('.search-bar input');
    const type = async (v) => { input.value = v; input.dispatchEvent(new w.Event('input')); await new Promise((r) => setTimeout(r, 15)); };
    return { w, input, type, list: () => w.document.querySelector('.search-results') };
}
afterEach(() => { windows.forEach((w) => w.close()); windows = []; });

test('match is case-insensitive, ignores apostrophes and needs every word', () => {
    const { w } = boot('student');
    const m = w.GEData.search.match;
    const items = [{ title: "O'quv guruhi" }, { title: 'JavaScript asoslari', sub: 'Dasturlash' }];
    expect(m(items, 'OQUV').length).toBe(1);
    expect(m(items, 'java asos').length).toBe(1);
    expect(m(items, 'java python').length).toBe(0);
    expect(m(items, '   ').length).toBe(0);
});

test('a student finds a course, a task and a group; titles stay text', async () => {
    const { w, type, list } = boot('student');
    await type('java');
    expect([...list().querySelectorAll('.search-kind')].map((n) => n.textContent)).toEqual(['Kurs', 'Vazifa']);
    await type('img');
    expect(list().querySelector('img')).toBeNull();
    expect(list().querySelector('.search-title').textContent).toContain('<img');
    await type('oquv');
    expect(list().querySelector('.search-kind').textContent).toBe('Guruh');
    expect(w.fetch.mock.calls.some(([u]) => u.includes('/teacher/'))).toBe(false);
});

test('clicking a course result opens its page with the right id', async () => {
    const { w, type, list, input } = boot('student');
    await type('javascript');
    list().querySelector('.search-item').click();
    expect(w.GEData.ctx.courseId).toBe(1);
    expect(w.loadPage).toHaveBeenCalled();
    expect(input.value).toBe('');
});

test('a teacher searches own courses and does not call student endpoints', async () => {
    const { w, type, list } = boot('teacher');
    await type('pyth');
    expect(list().querySelector('.search-kind').textContent).toBe('Kurs');
    expect(w.fetch.mock.calls.some(([u]) => u.includes('/student/'))).toBe(false);
});

test('no match says so; one failing source does not break the rest; Enter opens the first', async () => {
    const { w, type, list, input } = boot('student', '/student/tasks');
    await type('zzzz');
    expect(list().textContent).toContain('Hech narsa topilmadi');
    await type('java');
    expect(list().querySelectorAll('.search-item').length).toBe(1);
    input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(w.GEData.ctx.courseId).toBe(1);
});
