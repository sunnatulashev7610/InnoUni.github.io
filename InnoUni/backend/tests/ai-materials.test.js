process.env.JWT_SECRET = 'test-secret-test-secret-123';
delete process.env.ANTHROPIC_API_KEY;
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { parseMaterial } = require('../utils/aiProvider');

const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
let s;
const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT role, blocked')) return [[{ role: 'student', blocked: 0 }]];
        if (q.startsWith('INSERT IGNORE INTO ai_material_usage')) { s.usage[p[0]] = s.usage[p[0]] || 0; return [{ affectedRows: 1 }]; }
        if (q.startsWith('UPDATE ai_material_usage SET used = used + 1')) { if (s.usage[p[0]] < p[1]) { s.usage[p[0]]++; return [{ affectedRows: 1 }]; } return [{ affectedRows: 0 }]; }
        if (q.startsWith('UPDATE ai_material_usage SET used = used - 1')) { if (s.usage[p[0]] > 0) s.usage[p[0]]--; return [{ affectedRows: 1 }]; }
        if (q.startsWith('SELECT used FROM ai_material_usage')) return [s.usage[p[0]] === undefined ? [] : [{ used: s.usage[p[0]] }]];
        if (q.startsWith('INSERT INTO ai_materials')) { s.items.push({ id: s.items.length + 1, user_id: p[0], title: p[1], topic: p[2], kind: p[3], body: p[4], provider: p[5] }); return [{ insertId: s.items.length }]; }
        if (q.startsWith('SELECT id, title, topic, kind, provider, created_at FROM ai_materials')) return [s.items.filter((m) => m.user_id === p[0])];
        if (q.startsWith('SELECT id, title, topic, kind, body, provider, created_at FROM ai_materials')) return [s.items.filter((m) => m.id === p[0] && m.user_id === p[1])];
        if (q.startsWith('DELETE FROM ai_materials')) { const n = s.items.length; s.items = s.items.filter((m) => !(m.id === p[0] && m.user_id === p[1])); return [{ affectedRows: n - s.items.length }]; }
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(() => { s = { items: [], usage: {} }; ['ANTHROPIC_API_KEY', 'AI_MATERIAL_DAILY_LIMIT', 'FEATURE_AI'].forEach((k) => delete process.env[k]); });
const make = (body = { topic: 'React hooks' }, who = as(1)) => request(app).post('/api/ai-materials').set(who).send(body);

test('login is required', async () => {
    expect((await request(app).get('/api/ai-materials/options')).status).toBe(401);
    expect((await request(app).post('/api/ai-materials').send({ topic: 'abc' })).status).toBe(401);
});

test('the clarifying questions come from the server with their options', async () => {
    const r = await request(app).get('/api/ai-materials/options').set(as(1));
    expect(r.status).toBe(200);
    expect(r.body.questions.map((q) => q.key)).toEqual(['kind', 'style', 'level', 'length']);
    expect(r.body.questions.every((q) => q.options.length >= 3)).toBe(true);
    expect(r.body).toMatchObject({ limit: 5, used: 0, remaining: 5 });
});

test('a material is made to the answers (demo without a key) and stays private', async () => {
    const r = await make({ topic: 'React hooks', kind: 'Savol-javob (test)', style: 'Misollar bilan', level: 'O\'rta', length: 'Batafsil', extra: 'useEffect ham bo\'lsin' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ materialId: 1, provider: 'demo', used: 1, remaining: 4 });
    expect(s.items[0]).toMatchObject({ user_id: 1, kind: 'Savol-javob (test)', provider: 'demo' });
    expect(s.items[0].body).toMatch(/Misollar bilan[\s\S]*useEffect/);
    expect((await request(app).get('/api/ai-materials').set(as(9))).body.materials).toHaveLength(0);
    expect((await request(app).get('/api/ai-materials/1').set(as(9))).status).toBe(404);
    const mine = await request(app).get('/api/ai-materials/1').set(as(1));
    expect(mine.body.material).toMatchObject({ title: expect.stringContaining('React hooks'), demo: true });
});

test('empty answers use the first option; unknown answers and bad input are rejected for free', async () => {
    expect((await make({ topic: 'React hooks' })).status).toBe(201);
    expect(s.items[0].kind).toBe('Konspekt');
    for (const bad of [{}, { topic: 'ab' }, { topic: 'x'.repeat(201) }, { topic: 'abc', kind: 'Roman' }, { topic: 'abc', level: 5 }, { topic: 'abc', extra: 'x'.repeat(301) }]) {
        expect((await make(bad)).status).toBe(400);
    }
    expect(s.usage[1]).toBe(1);
});

test('daily limit, per user', async () => {
    process.env.AI_MATERIAL_DAILY_LIMIT = '1';
    expect((await make()).status).toBe(201);
    const r = await make();
    expect(r.status).toBe(429);
    expect(r.body.remaining).toBe(0);
    expect((await make({ topic: 'Python' }, as(9))).status).toBe(201);
});

test('with a key the brief goes to Claude; a bad answer gives the credit back', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'JSON emas' }] }) }));
    expect((await make()).status).toBe(502);
    expect(s.usage[1]).toBe(0);
    expect(s.items).toHaveLength(0);
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ title: 'Hooks', body: 'Matn' }) }] }) }));
    const ok = await make({ topic: 'React hooks', style: 'Rasmiy (akademik)' });
    expect(ok.body.provider).toBe('claude');
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent.system).toMatch(/material tayyorlovchi/);
    expect(JSON.parse(sent.messages[0].content)).toMatchObject({ topic: 'React hooks', style: 'Rasmiy (akademik)', kind: 'Konspekt' });
    expect(sent.system).not.toMatch(/k$/);
});

test('model answer parsing', () => {
    expect(parseMaterial('Mana: {"title":" T ","body":" B "}')).toEqual({ title: 'T', body: 'B' });
    expect(parseMaterial(JSON.stringify({ title: 'x', body: 'y'.repeat(30000) })).body).toHaveLength(20000);
    expect(() => parseMaterial('{"title":"x"}')).toThrow();
});

test('delete only my own', async () => {
    await make();
    expect((await request(app).delete('/api/ai-materials/1').set(as(9))).status).toBe(404);
    expect((await request(app).delete('/api/ai-materials/1').set(as(1))).status).toBe(200);
    expect(s.items).toHaveLength(0);
    expect((await request(app).delete('/api/ai-materials/abc').set(as(1))).status).toBe(400);
});

test('feature flag off hides it', async () => {
    process.env.FEATURE_AI = 'false';
    expect((await request(app).get('/api/ai-materials/options').set(as(1))).status).toBe(404);
});
