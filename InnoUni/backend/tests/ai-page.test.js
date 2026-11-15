const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const dataSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-data.js'), 'utf8');
const aiSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-ai.js'), 'utf8');

function boot(opts = {}) {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window;
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.localStorage.setItem('user', JSON.stringify({ email: 'a@b.uz' }));
    const calls = [];
    let remaining = opts.remaining === undefined ? 10 : opts.remaining;
    w.fetch = jest.fn(async (url, init = {}) => {
        const method = init.method || 'GET';
        calls.push({ url, method, body: init.body });
        const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
        if (url.includes('/ai/status')) return reply(200, { live: !!opts.live, limit: 10, used: 10 - remaining, remaining });
        if (url.includes('/ai/history') && method === 'GET') return reply(200, { messages: opts.history || [] });
        if (url.includes('/ai/history') && method === 'DELETE') return reply(200, { ok: true });
        if (url.includes('/ai/chat')) {
            if (opts.fail) return reply(502, { error: 'x' });
            if (remaining <= 0) return reply(429, { error: 'limit', limit: 10, used: 10, remaining: 0 });
            remaining -= 1;
            return reply(200, { reply: '<b>Javob</b>', provider: 'demo', limit: 10, used: 10 - remaining, remaining });
        }
        return reply(200, { courses: [{ id: 7, title: 'JS asoslari' }] });
    });
    w.eval(dataSrc); w.eval(aiSrc);
    const c = w.document.getElementById('c');
    const session = { id: 1, token: 't', name: 'Sam', role: 'student' };
    return { w, c, calls, run: () => w.GEData.hydrate('ai', c, session, () => {}, (e) => { throw e; }) };
}
const tick = () => new Promise((r) => setTimeout(r, 20));

test('renders status, courses and greeting; shows demo pill', async () => {
    const { c, run } = boot();
    await run();
    expect(c.textContent).toContain('Demo javoblar');
    expect(c.textContent).toContain('Bugun 10 ta savol qoldi');
    expect([...c.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Umumiy savol', 'JS asoslari']);
    expect(c.querySelector('.pg-msg.bot').textContent).toMatch(/AI ustozingizman/);
});

test('sending a question shows the reply as text, updates counter, sends course id', async () => {
    const { c, calls, run } = boot();
    await run();
    c.querySelector('select').value = '7'; c.querySelector('select').dispatchEvent(new c.ownerDocument.defaultView.Event('change'));
    await tick();
    c.querySelector('input').value = 'Funksiya nima?';
    c.querySelector('form').dispatchEvent(new c.ownerDocument.defaultView.Event('submit', { cancelable: true, bubbles: true }));
    await tick();
    const post = calls.find((x) => x.method === 'POST');
    expect(JSON.parse(post.body)).toEqual({ message: 'Funksiya nima?', course_id: 7 });
    const bots = c.querySelectorAll('.pg-msg.bot'); expect(bots[bots.length - 1].textContent).toBe('<b>Javob</b>');
    expect(c.querySelector('.pg-msgs b')).toBeNull();
    expect(c.textContent).toContain('Bugun 9 ta savol qoldi');
});

test('no questions left disables the input; failures show a friendly message', async () => {
    const a = boot({ remaining: 0 }); await a.run();
    expect(a.c.querySelector('input').disabled).toBe(true);
    const b = boot({ fail: true }); await b.run();
    b.c.querySelector('input').value = 'Salom';
    b.c.querySelector('form').dispatchEvent(new b.w.Event('submit', { cancelable: true }));
    await tick();
    expect(b.c.textContent).toMatch(/AI hozir javob bermayapti/);
    expect(b.c.textContent).not.toContain('Ustoz yozmoqda');
});

test('clearing the chat needs two clicks', async () => {
    const { c, calls, run } = boot();
    await run();
    const btn = [...c.querySelectorAll('button')].find((x) => x.textContent === 'Suhbatni tozalash');
    btn.click(); await tick();
    expect(calls.some((x) => x.method === 'DELETE')).toBe(false);
    btn.click(); await tick();
    expect(calls.some((x) => x.method === 'DELETE')).toBe(true);
});
