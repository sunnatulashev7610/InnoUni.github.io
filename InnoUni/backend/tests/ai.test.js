process.env.JWT_SECRET = 'test-secret-test-secret-123';
delete process.env.ANTHROPIC_API_KEY;
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { normalise } = require('../utils/aiProvider');

const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
let s;
const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT id, title, description, teacher_id FROM courses')) { const c = s.courses.find((x) => x.id === p[0]); return [c ? [c] : []]; }
        if (q.startsWith('SELECT id FROM course_enrollments')) return [s.enrolled.some((e) => e[0] === p[0] && e[1] === p[1]) ? [{ id: 1 }] : []];
        if (q.startsWith('SELECT title, kind FROM course_content')) return [[{ title: 'Kirish', kind: 'video' }, { title: 'useState', kind: 'guide' }]];
        if (q.startsWith('INSERT IGNORE INTO ai_usage')) { s.usage[p[0]] = s.usage[p[0]] || 0; return [{ affectedRows: 1 }]; }
        if (q.startsWith('UPDATE ai_usage SET used = used + 1')) { if (s.usage[p[0]] < p[1]) { s.usage[p[0]]++; return [{ affectedRows: 1 }]; } return [{ affectedRows: 0 }]; }
        if (q.startsWith('UPDATE ai_usage SET used = used - 1')) { if (s.usage[p[0]] > 0) s.usage[p[0]]--; return [{ affectedRows: 1 }]; }
        if (q.startsWith('SELECT used FROM ai_usage')) return [s.usage[p[0]] === undefined ? [] : [{ used: s.usage[p[0]] }]];
        if (q.startsWith('SELECT role, content FROM ai_messages')) return [s.msgs.filter((m) => m.user === p[0] && (p[1] === undefined ? m.course === null : m.course === p[1])).slice(-10).reverse()];
        if (q.startsWith('SELECT id, role, content, created_at FROM ai_messages')) return [s.msgs.filter((m) => m.user === p[0] && (p[1] === undefined ? m.course === null : m.course === p[1])).reverse().map((m, i) => ({ id: i, ...m }))];
        if (q.startsWith('INSERT INTO ai_messages')) { if (s.failInsert) throw new Error('db down'); s.msgs.push({ user: p[0], course: p[1], role: p[2], content: p[3] }); return [{ insertId: 1 }]; }
        if (q.startsWith('DELETE FROM ai_messages')) { s.msgs = s.msgs.filter((m) => !(m.user === p[0] && (p[1] === undefined ? m.course === null : m.course === p[1]))); return [{ affectedRows: 1 }]; }
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(() => {
    s = { courses: [{ id: 5, title: 'React', description: 'UI', teacher_id: 2 }], enrolled: [[5, 1]], usage: {}, msgs: [], failInsert: false };
    delete process.env.ANTHROPIC_API_KEY; delete process.env.AI_DAILY_LIMIT; delete process.env.FEATURE_AI;
});

const chat = (body, who = as(1)) => request(app).post('/api/ai/chat').set(who).send(body);

test('login is required', async () => {
    expect((await request(app).post('/api/ai/chat').send({ message: 'salom' })).status).toBe(401);
    expect((await request(app).get('/api/ai/status')).status).toBe(401);
});

test('without a key the answer is a labelled demo one and the question is counted', async () => {
    const r = await chat({ message: 'useState nima?' });
    expect(r.status).toBe(200);
    expect(r.body.provider).toBe('demo');
    expect(r.body.reply).toMatch(/Demo javob/);
    expect(r.body).toMatchObject({ limit: 10, used: 1, remaining: 9 });
    expect(s.msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
});

test('message must be 1-1000 characters', async () => {
    expect((await chat({ message: '   ' })).status).toBe(400);
    expect((await chat({ message: 'x'.repeat(1001) })).status).toBe(400);
    expect((await chat({ message: 123 })).status).toBe(400);
    expect(s.usage[1]).toBeUndefined(); // bad input costs nothing
});

test('the daily limit stops further questions, clearing the chat does not reset it', async () => {
    process.env.AI_DAILY_LIMIT = '2';
    expect((await chat({ message: 'bir' })).status).toBe(200);
    expect((await chat({ message: 'ikki' })).status).toBe(200);
    const r = await chat({ message: 'uch' });
    expect(r.status).toBe(429);
    expect(r.body.remaining).toBe(0);
    await request(app).delete('/api/ai/history').set(as(1));
    expect((await chat({ message: 'to\'rt' })).status).toBe(429);
});

test('limits are per user', async () => {
    process.env.AI_DAILY_LIMIT = '1';
    expect((await chat({ message: 'a' }, as(1))).status).toBe(200);
    expect((await chat({ message: 'a' }, as(9))).status).toBe(200);
});

test('a failed AI call gives the question back and answers 502', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    global.fetch = jest.fn(async () => ({ ok: false, status: 529, json: async () => ({}) }));
    const r = await chat({ message: 'salom' });
    expect(r.status).toBe(502);
    expect(s.usage[1]).toBe(0);
    expect(s.msgs).toHaveLength(0);
});

test('with a key the request goes to Claude with the course context and the history', async () => {
    process.env.ANTHROPIC_API_KEY = 'secret-key';
    s.msgs.push({ user: 1, course: 5, role: 'user', content: 'avvalgi savol' }, { user: 1, course: 5, role: 'assistant', content: 'avvalgi javob' });
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'Claude javobi' }] }) }));
    const r = await chat({ message: 'useState nima?', course_id: 5 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ reply: 'Claude javobi', provider: 'claude' });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('secret-key');
    const sent = JSON.parse(init.body);
    expect(sent.system).toMatch(/Kurs: React/);
    expect(sent.system).toMatch(/useState/);
    expect(sent.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(JSON.stringify(r.body)).not.toMatch(/secret-key/);
});

describe('courses', () => {
    test('a student can only use a course they are enrolled in', async () => {
        expect((await chat({ message: 'salom', course_id: 5 }, as(1))).status).toBe(200);
        expect((await chat({ message: 'salom', course_id: 5 }, as(7))).status).toBe(403);
        expect((await chat({ message: 'salom', course_id: 99 }, as(1))).status).toBe(403);
        expect((await chat({ message: 'salom', course_id: 'abc' }, as(1))).status).toBe(400);
        expect(s.usage[7]).toBeUndefined();
    });
    test('the teacher of the course and admins can use it', async () => {
        expect((await chat({ message: 'salom', course_id: 5 }, as(2, 'teacher'))).status).toBe(200);
        expect((await chat({ message: 'salom', course_id: 5 }, as(50, 'admin'))).status).toBe(200);
        expect((await chat({ message: 'salom', course_id: 5 }, as(3, 'teacher'))).status).toBe(403);
    });
    test('history is private to the user and to the course', async () => {
        await chat({ message: 'umumiy savol' }, as(1));
        await chat({ message: 'kurs savoli', course_id: 5 }, as(1));
        const general = await request(app).get('/api/ai/history').set(as(1));
        const course = await request(app).get('/api/ai/history?course_id=5').set(as(1));
        expect(general.body.messages.map((m) => m.content)).toEqual(expect.arrayContaining(['umumiy savol']));
        expect(general.body.messages.some((m) => m.content === 'kurs savoli')).toBe(false);
        expect(course.body.messages.some((m) => m.content === 'kurs savoli')).toBe(true);
        expect((await request(app).get('/api/ai/history').set(as(9))).body.messages).toEqual([]);
    });
});

test('status shows the mode and what is left', async () => {
    await chat({ message: 'a' });
    const r = await request(app).get('/api/ai/status').set(as(1));
    expect(r.body).toEqual({ live: false, limit: 10, used: 1, remaining: 9 });
});

test('the feature can be switched off', async () => {
    process.env.FEATURE_AI = 'false';
    expect((await chat({ message: 'a' })).status).toBe(404);
});

test('history repair keeps the API format valid', () => {
    expect(normalise([{ role: 'assistant', content: 'x' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }], 'c').map((m) => m.role)).toEqual(['user']);
    expect(normalise([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], 'c').map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
});
