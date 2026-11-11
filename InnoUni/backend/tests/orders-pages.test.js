const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const dataSrc = read('frontend/js/dashboard-data.js');
const ordersSrc = read('frontend/js/dashboard-orders.js');
const adminSrc = read('frontend/js/admin-orders.js');

const flush = () => new Promise((r) => setTimeout(r, 0));
let win; let doc; let calls; let db;
const ok = (j) => ({ ok: true, status: 200, json: async () => j });
const submit = (f) => f.dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
const byText = (sel, t) => [...doc.querySelectorAll(sel)].find((n) => n.textContent.includes(t));

function boot(role, state) {
    db = { mine: [], incoming: [], sugg: { courses: [], materials: [] }, ...state };
    const dom = new JSDOM('<!doctype html><body><div id="c"><p>demo</p></div></body>', { runScripts: 'outside-only' });
    win = dom.window; doc = win.document; calls = [];
    win.config = { apiBaseUrl: 'https://api.test/api' };
    win.loadPage = jest.fn();
    win.fetch = jest.fn(async (url, init = {}) => {
        const u = url.replace('https://api.test/api', ''); const m = init.method || 'GET';
        calls.push({ m, u, body: init.body && JSON.parse(init.body) });
        if (m === 'GET' && u === '/orders/mine') return ok({ orders: db.mine });
        if (m === 'GET' && u === '/orders/incoming') return ok({ orders: db.incoming });
        if (m === 'GET' && u.startsWith('/orders/suggestions')) return ok(db.sugg);
        if (m === 'POST' && u === '/orders') return { ok: true, status: 201, json: async () => ({ id: 9, status: 'pending', sentTo: init.body.includes('tariff') ? 'admin' : 'teacher' }) };
        return ok({});
    });
    win.eval(dataSrc); win.eval(ordersSrc);
    return { id: 5, token: 't', role };
}
const run = (page, session) => win.GEData.hydrate(page, doc.getElementById('c'), session, () => { throw new Error('auth'); }, (e) => { throw e; });
const order = (o) => ({ id: 1, kind: 'material', item_title: 'Kimyo', note: null, status: 'pending', price: null, reply: null, courseId: null, created_at: '2026-11-01T00:00:00Z', ...o });

describe('student orders page', () => {
    test('no price is mentioned before a teacher sets one; the form says who decides', async () => {
        const s = boot('student', { mine: [order()] });
        await run('orders', s);
        expect(doc.body.textContent).not.toContain('demo');
        expect(doc.body.textContent).not.toMatch(/so'm/);
        expect(doc.body.textContent).toContain('Narxni o\'qituvchi');
        expect(doc.body.textContent).toContain('Kutilmoqda');
    });
    test('offered orders show the price or "Tekin" and can be accepted or declined', async () => {
        const s = boot('student', { mine: [order({ id: 1, status: 'offered', price: 45000, reply: 'PDF tayyor' }), order({ id: 2, status: 'offered', price: 0, item_title: 'Free' })] });
        await run('orders', s);
        expect(doc.body.textContent).toContain('45 000 so\'m');
        expect(doc.body.textContent).toContain('Tekin');
        expect(doc.body.textContent).toContain('PDF tayyor');
        byText('button', 'Qabul qilish').click(); await flush();
        expect(calls.some((c) => c.m === 'POST' && c.u === '/orders/1/accept')).toBe(true);
    });
    test('without matches the request is sent straight away, without any price field', async () => {
        const s = boot('student', {});
        await run('orders', s);
        doc.getElementById('ordTitle').value = 'Kimyo darsligi';
        doc.getElementById('ordNote').value = 'PDF';
        submit(doc.querySelector('form')); await flush(); await flush();
        const post = calls.find((c) => c.m === 'POST' && c.u === '/orders');
        expect(post.body).toEqual({ kind: 'course', item_title: 'Kimyo darsligi', note: 'PDF' });
    });
    test('close matches are suggested first; "send anyway" then sends', async () => {
        const s = boot('student', { sugg: { courses: [{ id: 3, title: '<b>Python</b> asoslari', teacher: 'Malika', enrolled: true }], materials: [{ id: 4, kind: 'guide', title: 'Python PDF', courseId: 3, course: 'Python asoslari', enrolled: false }] } });
        await run('orders', s);
        doc.getElementById('ordTitle').value = 'Python darsligi';
        submit(doc.querySelector('form')); await flush(); await flush();
        expect(doc.body.textContent).toContain('Sizga mos tayyor');
        expect([...doc.querySelectorAll('form b')].every((n) => n.children.length === 0)).toBe(true); // titles stay text
        expect(doc.body.textContent).toContain('<b>Python</b> asoslari');
        expect(calls.some((c) => c.m === 'POST' && c.u === '/orders')).toBe(false);
        byText('button', 'Ochish').click();                                            // enrolled course opens
        expect(win.GEData.ctx.courseId).toBe(3);
        byText('button', 'Baribir so\'rov').click(); await flush(); await flush();
        expect(calls.some((c) => c.m === 'POST' && c.u === '/orders')).toBe(true);
    });
    test('tariff: no suggestions step, plan + period become the title; preset from the pricing page is used', async () => {
        const s = boot('student', {});
        win = null;
        const dom = null; void dom;
        // preset
        boot('student', {});
        win.GEData.ctx.orderPreset = { type: 'tarif', item: 'Standart tarif', yearly: true };
        await run('orders', s);
        expect(doc.getElementById('ordPlan').value).toBe('Standart tarif');
        expect(doc.getElementById('ordPeriod').value).toBe('Yillik');
        submit(doc.querySelector('form')); await flush(); await flush();
        expect(calls.some((c) => c.u.startsWith('/orders/suggestions'))).toBe(false);
        expect(calls.find((c) => c.m === 'POST').body).toEqual({ kind: 'tariff', item_title: 'Standart tarif (yillik)' });
    });
    test('empty title is blocked', async () => {
        const s = boot('student', {});
        await run('orders', s);
        submit(doc.querySelector('form')); await flush();
        expect(doc.body.textContent).toContain('Nima kerakligini yozing');
        expect(calls.filter((c) => c.m === 'POST')).toHaveLength(0);
    });
    test('hostile text stays text', async () => {
        const s = boot('student', { mine: [order({ item_title: '<img src=x onerror=1>', note: '<script>1</script>' })] });
        await run('orders', s);
        expect(doc.querySelectorAll('img, script').length).toBe(0);
    });
});

describe('teacher orders page', () => {
    const inc = (o) => ({ id: 1, kind: 'material', item_title: 'Kimyo', note: 'PDF', status: 'pending', price: null, reply: null, course_title: null, student: 'Ali', created_at: '2026-11-01T00:00:00Z', ...o });
    test('sets a price, makes free, rejects', async () => {
        const s = boot('teacher', { incoming: [inc(), inc({ id: 2, status: 'offered', price: 10000 })] });
        await run('t-orders', s);
        expect(doc.querySelectorAll('article, .pg-card').length).toBe(1);                // only pending in the default tab
        submit(doc.querySelector('form')); await flush();
        expect(doc.body.textContent).toContain('Narxni so\'mda');
        doc.querySelector('[aria-label="Narx"]').value = '45000';
        doc.querySelector('[aria-label="Izoh"]').value = 'PDF tayyor';
        submit(doc.querySelector('form')); await flush(); await flush();
        expect(calls.find((c) => /offer$/.test(c.u))).toMatchObject({ u: '/orders/1/offer', body: { price: 45000, reply: 'PDF tayyor' } });
        byText('button', 'Tekin qilish').click(); await flush();
        expect(calls.filter((c) => /offer$/.test(c.u))[1].body).toEqual({ free: true, reply: '' });
        byText('button', 'Rad etish').click(); await flush();
        expect(calls.some((c) => /reject$/.test(c.u))).toBe(true);
    });
    test('answered tab and empty state', async () => {
        const s = boot('teacher', { incoming: [inc({ id: 2, status: 'offered', price: 0 })] });
        await run('t-orders', s);
        expect(doc.body.textContent).toContain('Hozircha javob kutayotgan so\'rov yo\'q');
        byText('button', 'Javob berilgan').click();
        expect(doc.body.textContent).toContain('Tekin');
    });
});

describe('admin orders page', () => {
    test('lists tariff orders and decides them; other requests are read-only', async () => {
        const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only' });
        win = dom.window; doc = win.document; calls = [];
        win.config = { apiBaseUrl: 'https://api.test/api' };
        win.fetch = jest.fn(async (url, init = {}) => {
            const u = url.replace('https://api.test/api', ''); calls.push({ m: init.method || 'GET', u, body: init.body && JSON.parse(init.body) });
            if (u.startsWith('/admin/orders?')) return ok({ orders: [{ id: 3, kind: 'tariff', item_title: '<b>Standart</b>', note: null, price: null, status: 'pending', full_name: 'Ali' }, { id: 4, kind: 'material', item_title: 'M', status: 'offered', price: 5, full_name: 'Vali' }] });
            return ok({});
        });
        win.eval(adminSrc);
        const toast = jest.fn();
        await win.AdminOrders.render(doc.getElementById('c'), 'tok', () => { throw new Error('auth'); }, toast);
        expect(doc.querySelectorAll('td b').length).toBe(2);   // titles as text, no parsed markup
        expect(doc.body.textContent).toContain('<b>Standart</b>');
        expect(doc.querySelectorAll('button.pg-btn').length).toBe(2);   // only the pending tariff has actions (confirm, reject)
        byText('button', 'Tasdiqlash').click(); await flush(); await flush();
        expect(calls.find((c) => c.m === 'POST')).toMatchObject({ u: '/admin/orders/3/decision', body: { status: 'confirmed' } });
        expect(toast).toHaveBeenCalledWith('Buyurtma tasdiqlandi');
    });
});
