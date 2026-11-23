// One dashboard section for the three AI tools: assistant, course creator, material creator
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../..');
const dataSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-data.js'), 'utf8');
const hubSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-ai-hub.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'secondary-pages/dashboard/dashboard.html'), 'utf8');

let windows = []; afterEach(() => { windows.forEach((w) => w.close()); windows = []; });
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function boot(ctx = {}) {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window; windows.push(w);
    w.config = { apiBaseUrl: 'https://api.test/api' }; w.loadPage = jest.fn(); w.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    w.eval(dataSrc);
    const G = w.GEData; const opened = [];
    ['ai', 'ai-courses', 'ai-materials'].forEach((n) => G.register(n, async (root) => { opened.push(n); root.textContent = ''; const p = w.document.createElement('p'); p.textContent = 'tool:' + n; root.appendChild(p); }));
    w.eval(hubSrc);
    Object.assign(G.ctx, ctx);
    const c = w.document.getElementById('c');
    return { w, G, c, opened, run: async () => { await G.hydrate('ai-hub', c, { id: 1, role: 'student' }, () => {}, (e) => { throw e; }); await tick(); } };
}
const tab = (c, key) => c.querySelector(`[data-tab="${key}"]`);

test('opens the assistant first; the other tools are not loaded until chosen', async () => {
    const t = boot(); await t.run();
    expect(t.c.querySelector('h1').textContent).toBe('AI vositalari');
    expect([...t.c.querySelectorAll('[role=tab]')].map((b) => b.textContent)).toEqual(['AI yordamchi', 'Kurs yaratuvchi', 'Material yaratuvchi']);
    expect(t.opened).toEqual(['ai']);
    expect(t.c.querySelector('[data-pane=ai]').textContent).toBe('tool:ai');
});
test('choosing a tool opens it once and keeps the others as they were', async () => {
    const t = boot(); await t.run();
    tab(t.c, 'ai-courses').click(); await tick();
    expect(t.opened).toEqual(['ai', 'ai-courses']);
    expect(t.c.querySelector('[data-pane=ai-courses]').hidden).toBe(false);
    expect(t.c.querySelector('[data-pane=ai]').hidden).toBe(true);
    expect(tab(t.c, 'ai-courses').classList.contains('on')).toBe(true);
    tab(t.c, 'ai').click(); await tick();
    tab(t.c, 'ai-courses').click(); await tick();
    expect(t.opened).toEqual(['ai', 'ai-courses']);   // never opened twice
});
test('the page that sent the person decides the tab; a wrong value falls back to the assistant', async () => {
    const a = boot({ aiTab: 'ai-materials' }); await a.run();
    expect(a.opened).toEqual(['ai-materials']);
    const b = boot({ aiTab: '<b>x</b>' }); await b.run();
    expect(b.opened).toEqual(['ai']);
});
test('a tool that fails shows a short message and the other tabs still work', async () => {
    const t = boot();
    t.G.register('ai-courses', async () => { throw new Error('boom'); });
    const spy = jest.spyOn(t.w.console, 'error').mockImplementation(() => {});
    await t.run();
    tab(t.c, 'ai-courses').click(); await tick();
    expect(t.c.querySelector('[data-pane=ai-courses]').textContent).toContain("yuklab bo'lmadi");
    tab(t.c, 'ai-materials').click(); await tick();
    expect(t.c.querySelector('[data-pane=ai-materials]').textContent).toBe('tool:ai-materials');
    spy.mockRestore();
});

describe('the sidebar', () => {
    const items = (group) => { const d = new JSDOM(html).window.document; return [...d.querySelectorAll(`[data-role-group="${group}"] .nav-item`)].map((b) => /loadPage\('([^']+)'/.exec(b.getAttribute('onclick'))[1]); };
    test('students: one AI item and one competitions item; the three old AI items are gone', () => {
        const s = items('student');
        expect(s.filter((p) => p === 'ai-hub')).toHaveLength(1);
        expect(s).toContain('musobaqalar');
        ['ai', 'ai-courses', 'ai-materials'].forEach((p) => expect(s).not.toContain(p));
    });
    test('teachers: one AI item instead of three', () => {
        const t = items('teacher');
        expect(t.filter((p) => p === 'ai-hub')).toHaveLength(1);
        ['ai', 'ai-courses', 'ai-materials'].forEach((p) => expect(t).not.toContain(p));
    });
    test('competitions stay behind the teams switch; old AI links open the hub tab', () => {
        expect(html).toMatch(/musobaqalar: 'teams'/);
        expect(html).toMatch(/AI_TABS = \{ ai: 'ai', 'ai-courses': 'ai-courses', 'ai-materials': 'ai-materials' \}/);
        expect(html).toContain("page = 'ai-hub'");
        expect(fs.existsSync(path.join(root, 'secondary-pages/dashboard/pages/ai-hub.html'))).toBe(true);
        expect(fs.existsSync(path.join(root, 'secondary-pages/dashboard/pages/musobaqalar.html'))).toBe(true);
    });
});
