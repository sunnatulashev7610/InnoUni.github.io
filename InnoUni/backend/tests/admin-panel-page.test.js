const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../frontend/js/admin-panel.js'), 'utf8');

const USERS = [
    { id: 1, full_name: 'Sam Admin', email: 'sam@x.uz', role: 'admin', blocked: 0, email_verified: 1, created_at: '2026-10-01' },
    { id: 2, full_name: '<i>Ali</i>', email: 'ali@x.uz', role: 'student', blocked: 0, email_verified: 0, created_at: '2026-11-01' },
    { id: 3, full_name: 'Gulnora', email: 'g@x.uz', role: 'teacher', blocked: 1, email_verified: 1, created_at: '2026-11-02' }
];
const answers = (url) => {
    if (url.includes('/admin/stats')) return { users: { student: 7, teacher: 2, admin: 1 }, teams: 4, courses: 9, unverified: 5, new_week: 6 };
    if (url.includes('/admin/log')) return { log: [{ id: 1, action: 'block', detail: null, created_at: '2026-11-20T10:00:00Z', admin: 'Sam', target: 'Ali' }, { id: 2, action: 'set_role', detail: 'teacher', created_at: '2026-11-20T09:00:00Z', admin: 'Sam', target: 'Gulnora' }] };
    if (url.includes('/admin/users')) return { users: JSON.parse(JSON.stringify(USERS)) };
    return {};
};
let windows = [];
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

async function boot(fn, status) {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only' });
    const w = dom.window; windows.push(w);
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.confirm = jest.fn(() => true);
    w.fetch = jest.fn(async (url, o) => ({ ok: !status, status: status || 200, json: async () => (o && o.method === 'POST' ? { ok: true } : answers(url)) }));
    w.eval(src);
    const toast = jest.fn(); const onAuth = jest.fn();
    const c = w.document.getElementById('c');
    await fn(w, c, onAuth, toast);
    await tick();
    return { w, c, toast, onAuth };
}
afterEach(() => { windows.forEach((w) => w.close()); windows = []; });

test('overview shows real numbers, the to-do hints and the log', async () => {
    const { c } = await boot((w, c, a, t) => w.AdminPanel.home(c, 'tok', a, t));
    const t = c.textContent;
    ['7', '2', '9', '4', '6'].forEach((n) => expect(t).toContain(n));
    expect(t).not.toContain('buyurtma');
    expect(t).toContain('5 ta foydalanuvchi emailini');
    expect(t).toContain('Sam · Ali: bloklandi');
    expect(t).toContain('Sam · Gulnora: roli o\'zgartirildi (O\'qituvchi)');
    expect(t).not.toContain('namuna');
});

test('overview: a rejected token sends the admin back to the login', async () => {
    const { onAuth } = await boot((w, c, a, t) => w.AdminPanel.home(c, 'bad', a, t), 401);
    expect(onAuth).toHaveBeenCalled();
});

test('users: names are plain text, own row has no controls, flags are shown', async () => {
    const { c } = await boot((w, c, a, t) => w.AdminPanel.users(c, 'tok', a, t, 1));
    const rows = c.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect(c.querySelector('tbody i')).toBeNull();
    expect(rows[1].textContent).toContain('<i>Ali</i>');
    expect(rows[0].querySelector('select, button')).toBeNull();
    expect(rows[0].textContent).toContain('(siz)');
    expect(rows[1].textContent).toContain('Email tasdiqlanmagan');
    expect(rows[2].textContent).toContain('Bloklangan');
});

test('users: blocking needs a second click, then sends the request and updates the row', async () => {
    const { w, c, toast } = await boot((w, c, a, t) => w.AdminPanel.users(c, 'tok', a, t, 1));
    const btn = () => c.querySelectorAll('tbody tr')[1].querySelector('button');
    btn().click();
    expect(btn().textContent).toBe('Aniqmi?');
    expect(w.fetch.mock.calls.some(([, o]) => o && o.method === 'POST')).toBe(false);
    btn().click(); await tick();
    const post = w.fetch.mock.calls.find(([, o]) => o && o.method === 'POST');
    expect(post[0]).toContain('/admin/users/2/block');
    expect(JSON.parse(post[1].body)).toEqual({ blocked: true });
    expect(toast).toHaveBeenCalledWith('Foydalanuvchi bloklandi');
    expect(c.querySelectorAll('tbody tr')[1].textContent).toContain('Bloklangan');
});

test('users: unblocking is one click; a role change asks first and sends the new role', async () => {
    const { w, c } = await boot((w, c, a, t) => w.AdminPanel.users(c, 'tok', a, t, 1));
    c.querySelectorAll('tbody tr')[2].querySelector('button').click(); await tick();
    expect(JSON.parse(w.fetch.mock.calls.find(([, o]) => o && o.method === 'POST')[1].body)).toEqual({ blocked: false });
    const sel = c.querySelectorAll('tbody tr')[1].querySelector('select');
    sel.value = 'teacher'; sel.dispatchEvent(new w.Event('change')); await tick();
    expect(w.confirm).toHaveBeenCalled();
    const role = w.fetch.mock.calls.filter(([, o]) => o && o.method === 'POST').pop();
    expect(role[0]).toContain('/admin/users/2/role');
    expect(JSON.parse(role[1].body)).toEqual({ role: 'teacher' });
});

test('users: declining the confirmation changes nothing', async () => {
    const { w, c } = await boot((w, c, a, t) => w.AdminPanel.users(c, 'tok', a, t, 1));
    w.confirm = jest.fn(() => false);
    const sel = c.querySelectorAll('tbody tr')[1].querySelector('select');
    sel.value = 'admin'; sel.dispatchEvent(new w.Event('change')); await tick();
    expect(sel.value).toBe('student');
    expect(w.fetch.mock.calls.some(([, o]) => o && o.method === 'POST')).toBe(false);
});

test('users: search and role filter go to the server', async () => {
    const { w, c } = await boot((w, c, a, t) => w.AdminPanel.users(c, 'tok', a, t, 1));
    const input = c.querySelector('input'); input.value = 'a&b'; input.dispatchEvent(new w.Event('input')); await tick(350);
    expect(w.fetch.mock.calls.pop()[0]).toContain('/admin/users?q=a%26b');
    [...c.querySelectorAll('.pg-chip')].find((b) => /O'qituvchilar/.test(b.textContent)).click(); await tick();
    expect(w.fetch.mock.calls.pop()[0]).toContain('role=teacher');
});
