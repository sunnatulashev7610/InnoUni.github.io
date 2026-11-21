const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '../../frontend/js', f), 'utf8');
const dataSrc = read('dashboard-data.js'); const notifSrc = read('dashboard-notifications.js');
const wins = [];
afterEach(() => { wins.splice(0).forEach((w) => w.close()); }); // stops the module's refresh timer
const tick = () => new Promise((r) => setTimeout(r, 25));

function boot(payload) {
    const dom = new JSDOM('<!doctype html><body><div class="notification-btn"><i></i><span class="notification-badge">3</span></div><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window; wins.push(w);
    w.config = { apiBaseUrl: 'https://api.test/api' };
    const calls = [];
    w.fetch = jest.fn(async (url, init = {}) => {
        const method = init.method || 'GET'; calls.push({ url, method });
        const u = new URL(url).pathname.replace('/api', '');
        const reply = (b) => ({ ok: true, status: 200, json: async () => b });
        if (u === '/notifications' && method === 'GET') return reply(JSON.parse(JSON.stringify(payload)));
        return reply({ ok: true });
    });
    w.eval(dataSrc); w.eval(notifSrc);
    w.GEData.open = jest.fn();
    w.GEData.notifications.start({ id: 1, token: 't', role: 'student' });
    return { w, calls, bell: w.document.querySelector('.notification-btn'), badge: w.document.querySelector('.notification-badge') };
}
const data = { unread: 2, items: [
    { id: 1, kind: 'answer', title: 'Savolingizga <b>javob</b>', body: 'Mana', page: 'course-detail', ref_id: 5, read: false, created_at: new Date().toISOString() },
    { id: 2, kind: 'grade', title: 'Baholandi', body: null, page: 'vazifalar', ref_id: null, read: false, created_at: new Date().toISOString() },
    { id: 3, kind: 'x', title: 'Eski', body: null, page: null, ref_id: null, read: true, created_at: new Date().toISOString() }] };

test('the badge shows the real unread number, the bell is keyboard reachable', async () => {
    const { badge, bell } = boot(data); await tick();
    expect(badge.textContent).toBe('2'); expect(badge.hidden).toBe(false);
    expect(bell.getAttribute('role')).toBe('button'); expect(bell.getAttribute('tabindex')).toBe('0');
});

test('zero unread hides the badge', async () => {
    const { badge } = boot({ unread: 0, items: [] }); await tick();
    expect(badge.hidden).toBe(true);
});

test('opening lists items as plain text; a click marks read and opens the page', async () => {
    const { w, bell, badge, calls } = boot(data); await tick();
    bell.click(); await tick();
    const panel = w.document.querySelector('[role="dialog"]');
    expect(panel.textContent).toContain('Savolingizga <b>javob</b>'); expect(panel.querySelector('b b')).toBeNull();
    expect(bell.getAttribute('aria-expanded')).toBe('true');
    [...panel.querySelectorAll('button')].find((b) => b.textContent.includes('Savolingizga')).click(); await tick();
    expect(calls.some((c) => c.method === 'PUT' && c.url.endsWith('/notifications/1/read'))).toBe(true);
    expect(w.GEData.ctx.courseId).toBe(5);
    expect(w.GEData.open).toHaveBeenCalledWith('course-detail', 'courses');
    expect(badge.textContent).toBe('1');
    expect(w.document.querySelector('[role="dialog"]')).toBeNull();
});

test('read-all, clear, Escape and outside click', async () => {
    const { w, bell, badge, calls } = boot(data); await tick();
    bell.click(); await tick();
    [...w.document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Hammasi o\'qildi').click(); await tick();
    expect(calls.some((c) => c.url.endsWith('/notifications/read-all'))).toBe(true); expect(badge.hidden).toBe(true);
    [...w.document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Tozalash').click(); await tick();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
    expect(w.document.querySelector('[role="dialog"]').textContent).toContain('yangi xabar yo\'q');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.document.querySelector('[role="dialog"]')).toBeNull();
    bell.click(); await tick(); w.document.body.click();
    expect(w.document.querySelector('[role="dialog"]')).toBeNull();
});

test('a failed refresh keeps the old list', async () => {
    const { w, bell, badge } = boot(data); await tick();
    w.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    bell.click(); await tick();
    expect(badge.textContent).toBe('2');
});
