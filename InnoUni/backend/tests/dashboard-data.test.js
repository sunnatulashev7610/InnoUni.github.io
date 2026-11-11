const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../frontend/js/dashboard-data.js'), 'utf8');
const home = fs.readFileSync(path.join(__dirname, '../../secondary-pages/dashboard/pages/main.dashboard.html'), 'utf8');
const body = home.slice(home.indexOf('<body>') + 6, home.indexOf('<script>', home.indexOf('<body>')));

const session = { id: 7, token: 'tok', name: 'Ali Valiyev', role: 'student' };
const stats = { courses: { active: 3, avg_progress: 40 }, tasks: { total: 4, overdue: 1, due_this_week: 2 }, groups: { active: 5 }, learning: { current_streak: 14 } };

let window;
let document;
function setup(activity, fail) {
    const dom = new JSDOM('<!doctype html><body>' + body + '</body>', { runScripts: 'outside-only' });
    window = dom.window;
    document = window.document;
    window.config = { apiBaseUrl: 'https://api.test/api' };
    window.fetch = jest.fn(async (url) => {
        if (fail) return { ok: false, status: fail, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => (url.includes('/stats/') ? stats : activity) };
    });
    window.eval(src); // defines window.GEData
}
const run = () => new Promise((resolve) => {
    const calls = { auth: 0, err: 0 };
    window.GEData.hydrate('main.dashboard', document.body, session, () => { calls.auth++; }, () => { calls.err++; }).then(() => resolve(calls));
});

test('fills greeting, stat cards and activity from the API with the token', async () => {
    setup([{ type: 'course', title: 'JS', timestamp: new Date().toISOString(), icon: 'fa-graduation-cap' }]);
    await run();
    expect(document.querySelector('.home-user h3').textContent).toBe('Xush kelibsiz, Ali!');
    expect([...document.querySelectorAll('.stat-number')].map((n) => n.textContent)).toEqual(['3', '2', '5', '14']);
    expect(document.querySelector('.activity-title').textContent).toBe('"JS" kursiga yozildingiz');
    expect(window.fetch.mock.calls[0][0]).toMatch(/^https:\/\/api\.test\/api\/dashboard\/(stats|activity)\/7/);
    expect(window.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
});

test('hostile titles are shown as text, never as HTML', async () => {
    setup([{ type: 'task', title: '<img src=x onerror=alert(1)>', timestamp: new Date().toISOString(), icon: 'fa-x"><script>' }]);
    await run();
    expect(document.querySelectorAll('.activity-list img, .activity-list script').length).toBe(0);
    expect(document.querySelector('.activity-title').textContent).toContain('<img');
});

test('empty activity shows a hint', async () => {
    setup([]);
    await run();
    expect(document.querySelector('.activity-list').textContent).toMatch(/Hali faoliyat yo'q/);
});

test('401 calls the auth handler, 500 the error handler', async () => {
    setup([], 401);
    expect(await run()).toEqual({ auth: 1, err: 0 });
    setup([], 500);
    expect(await run()).toEqual({ auth: 0, err: 1 });
});

test('unknown pages and demo mode do nothing', async () => {
    setup([]);
    await window.GEData.hydrate('courses', document.body, session, () => {}, () => {});
    await window.GEData.hydrate('main.dashboard', document.body, null, () => {}, () => {});
    expect(window.fetch).not.toHaveBeenCalled();
});

test('relative times', () => {
    setup([]);
    const ago = window.GEData._ago;
    expect(ago(new Date(Date.now() - 5 * 60000))).toBe('5 daqiqa oldin');
    expect(ago(new Date(Date.now() - 3 * 3600000))).toBe('3 soat oldin');
    expect(ago(new Date(Date.now() - 2 * 86400000))).toBe('2 kun oldin');
});
