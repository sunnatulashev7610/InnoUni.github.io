const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '../../frontend/js', f), 'utf8');
const dataSrc = read('dashboard-data.js'); const toolsSrc = read('dashboard-course-tools.js');
const tick = () => new Promise((r) => setTimeout(r, 25));
const items = [
    { id: 10, kind: 'video', title: 'Kirish videosi', url: 'https://example.com/v', position: 1 },
    { id: 12, kind: 'guide', title: 'Qo\'llanma', url: 'https://example.com/g', position: 2 }
];

function boot({ tools } = {}) {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window; w.open = jest.fn();
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.localStorage.setItem('user', JSON.stringify({ email: 'a@b.uz' }));
    const calls = [];
    const state = tools || { notes: [], materials: [], can_manage: false, limits: { maxNote: 2000 } };
    w.fetch = jest.fn(async (url, init = {}) => {
        const method = init.method || 'GET';
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ url, method, body });
        const u = new URL(url).pathname.replace('/api', '');
        const reply = (b, ok = true, status = 200) => ({ ok, status, json: async () => b });
        if (u === '/student/courses/5/content') return reply({ course: { id: 5, title: 'Kurs', teacher: 'T', ai: false }, items, resume: null });
        if (u === '/course-tools/courses/5') return reply(state);
        if (u === '/course-tools/items/10/note') return reply({ item_id: 10, body: body.body === undefined ? '' : body.body, bookmarked: body.bookmarked === undefined ? false : body.bookmarked });
        return reply({ ok: true });
    });
    w.eval(dataSrc); w.eval(toolsSrc);
    w.GEData.ctx.courseId = 5;
    const c = w.document.getElementById('c');
    return { w, c, calls, run: () => w.GEData.hydrate('course-detail', c, { id: 2, token: 't', role: 'student' }, () => {}, (e) => { throw e; }) };
}
const toggle = (c, n = 0) => [...c.querySelectorAll('button')].filter((b) => b.textContent.startsWith('Eslatma va materiallar'))[n];

test('each item has a panel button; opening shows the note box and the bookmark', async () => {
    const { c, run } = boot(); await run();
    expect(c.querySelectorAll('button[aria-expanded]').length).toBe(2);
    toggle(c).click();
    expect(c.querySelector('textarea').maxLength).toBe(2000);
    expect(c.querySelector('button[aria-pressed="false"]').textContent).toContain('Xatcho');
    toggle(c).click();
    expect(c.querySelector('textarea')).toBeNull();
});

test('saving a note and bookmarking send the right request and update the list', async () => {
    const { c, calls, run } = boot(); await run();
    toggle(c).click();
    c.querySelector('textarea').value = 'Muhim joy <b>x</b>';
    [...c.querySelectorAll('button')].find((b) => b.textContent === 'Eslatmani saqlash').click(); await tick();
    const put = calls.find((x) => x.method === 'PUT' && x.url.endsWith('/items/10/note'));
    expect(put.body).toEqual({ body: 'Muhim joy <b>x</b>' });
    const mine = [...c.querySelectorAll('section')].find((s) => s.textContent.includes('Mening eslatmalarim'));
    expect(mine.hidden).toBe(false);
    expect(mine.textContent).toContain('Muhim joy <b>x</b>');
    expect(mine.querySelector('b b')).toBeNull();
    c.querySelector('button[aria-pressed]').click(); await tick();
    expect(calls.filter((x) => x.method === 'PUT').pop().body).toEqual({ bookmarked: true });
    expect(toggle(c).textContent).toContain('★');
});

test('materials show as safe links; a javascript: link gets no href', async () => {
    const { c, run } = boot({ tools: { notes: [], materials: [{ id: 1, item_id: 10, title: 'Slayd', url: 'https://example.com/s.pdf' }, { id: 2, item_id: 10, title: 'Yomon', url: 'javascript:alert(1)' }], can_manage: false, limits: { maxNote: 2000 } } });
    await run();
    expect(toggle(c).textContent).toContain('2 ta material');
    toggle(c).click();
    const links = [...c.querySelectorAll('a')].filter((a) => ['Slayd', 'Yomon'].includes(a.textContent));
    expect(links[0].href).toBe('https://example.com/s.pdf'); expect(links[0].rel).toBe('noopener noreferrer'); expect(links[0].target).toBe('_blank');
    expect(links[1].getAttribute('href')).toBeNull();
});

test('when the tools cannot load the course page still works', async () => {
    const { c, w, run } = boot();
    const f = w.fetch; w.fetch = jest.fn(async (u, i) => (u.includes('/course-tools/') ? { ok: false, status: 500, json: async () => ({}) } : f(u, i)));
    await run();
    expect(c.textContent).toContain('Kirish videosi');
    expect(c.querySelectorAll('button[aria-expanded]').length).toBe(0);
});
