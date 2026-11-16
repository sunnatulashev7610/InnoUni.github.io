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
    let items = [{ id: 3, title: '<b>Hooks</b>', kind: 'Konspekt', demo: false }];
    let remaining = opts.remaining === undefined ? 5 : opts.remaining;
    w.fetch = jest.fn(async (url, init = {}) => {
        const method = init.method || 'GET';
        calls.push({ url, method, body: init.body });
        const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
        if (url.endsWith('/ai/status')) return reply(200, { live: false, limit: 10, used: 0, remaining: 10 });
        if (url.endsWith('/ai-materials/options')) return reply(200, { questions: [{ key: 'kind', label: 'Qanday material kerak?', options: ['Konspekt', 'Reja va jadval'] }, { key: 'level', label: 'Qaysi daraja?', options: ['Boshlang\'ich', 'O\'rta'] }], extraLabel: 'Yana nimani hisobga olay?', limit: 5, used: 5 - remaining, remaining });
        if (url.endsWith('/ai-materials') && method === 'GET') return reply(200, { materials: items });
        if (url.endsWith('/ai-materials') && method === 'POST') {
            if (opts.fail) return reply(opts.fail, { error: 'x' });
            remaining -= 1; items = [{ id: 9, title: 'Yangi material', kind: 'Reja va jadval', demo: true }, ...items];
            return reply(201, { materialId: 9, provider: 'demo', limit: 5, used: 5 - remaining, remaining });
        }
        if (/ai-materials\/\d+$/.test(url) && method === 'GET') return reply(200, { material: { body: '<u>Matn</u>' } });
        if (method === 'DELETE') return reply(200, {});
        return reply(404, {});
    });
    w.eval(dataSrc); w.eval(aiSrc);
    const c = w.document.getElementById('c');
    return { w, c, calls, run: () => w.GEData.hydrate('ai-materials', c, { id: 1, token: 't', name: 'Sam Test', role: 'student' }, () => {}, (e) => { throw e; }) };
}
const tick = () => new Promise((r) => setTimeout(r, 20));
const btn = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

test('asks the questions the server offers and lists my materials as text with the credit', async () => {
    const { c, run } = boot();
    await run();
    expect([...c.querySelectorAll('label')].map((l) => l.textContent)).toEqual(['Mavzu', 'Qanday material kerak?', 'Qaysi daraja?', 'Yana nimani hisobga olay?']);
    expect(c.textContent).toContain('Bugun 5 ta material yaratish qoldi');
    expect(c.querySelector('section h3').textContent).toBe('<b>Hooks</b>');
    expect(c.querySelector('section b')).toBeNull();
    expect(c.textContent).toContain('Gather Edu × Sam Test');
    expect(c.textContent).toContain('Shaxsiy');
});

test('creating sends topic, answers and extra, then shows the new material', async () => {
    const { c, calls, run } = boot();
    await run();
    const [topic, kind, level, extra] = c.querySelectorAll('input, select');
    topic.value = 'React hooks'; kind.value = 'Reja va jadval'; level.value = 'O\'rta'; extra.value = 'Qisqa bo\'lsin';
    c.querySelector('form').dispatchEvent(new c.ownerDocument.defaultView.Event('submit', { cancelable: true }));
    await tick();
    expect(JSON.parse(calls.find((x) => x.method === 'POST').body)).toEqual({ topic: 'React hooks', extra: 'Qisqa bo\'lsin', kind: 'Reja va jadval', level: 'O\'rta' });
    expect(c.textContent).toContain('Yangi material');
    expect(c.textContent).toContain('Bugun 4 ta material yaratish qoldi');
});

test('opens the body as text, deletes with two clicks, explains errors, limit disables the button', async () => {
    const a = boot(); await a.run();
    btn(a.c, 'Ochish').click(); await tick();
    expect(a.c.querySelector('section div.pg-muted[style*="pre-wrap"]').textContent).toBe('<u>Matn</u>');
    btn(a.c, 'O\'chirish').click(); await tick();
    expect(a.calls.some((x) => x.method === 'DELETE')).toBe(false);
    btn(a.c, 'Aniq o\'chiraymi?').click(); await tick();
    expect(a.c.textContent).toContain('Hozircha yo\'q');
    const b = boot({ fail: 502 }); await b.run();
    b.c.querySelector('input').value = 'React';
    b.c.querySelector('form').dispatchEvent(new b.w.Event('submit', { cancelable: true }));
    await tick();
    expect(b.c.textContent).toMatch(/AI hozir material yoza olmadi/);
    expect(btn(b.c, 'Material yaratish').disabled).toBe(false);
    const d = boot({ remaining: 0 }); await d.run();
    expect(btn(d.c, 'Material yaratish').disabled).toBe(true);
});
