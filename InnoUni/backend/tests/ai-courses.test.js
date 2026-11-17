process.env.JWT_SECRET = 'test-secret-test-secret-123';
delete process.env.ANTHROPIC_API_KEY;
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { parseCourse } = require('../utils/aiProvider');

const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
let s;
const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT role, blocked FROM users')) return [[{ role: p[0] === 2 ? 'teacher' : 'student', blocked: 0 }]];
        if (q.startsWith('INSERT IGNORE INTO ai_course_usage')) { s.usage[p[0]] = s.usage[p[0]] || 0; return [{ affectedRows: 1 }]; }
        if (q.startsWith('UPDATE ai_course_usage SET used = used + 1')) { if (s.usage[p[0]] < p[1]) { s.usage[p[0]]++; return [{ affectedRows: 1 }]; } return [{ affectedRows: 0 }]; }
        if (q.startsWith('UPDATE ai_course_usage SET used = used - 1')) { if (s.usage[p[0]] > 0) s.usage[p[0]]--; return [{ affectedRows: 1 }]; }
        if (q.startsWith('SELECT used FROM ai_course_usage')) return [s.usage[p[0]] === undefined ? [] : [{ used: s.usage[p[0]] }]];
        if (q.startsWith('INSERT INTO courses')) { if (s.failInsert) throw new Error('db down'); s.courses.push({ id: s.courses.length + 1, title: p[0], description: p[1], category: p[2], teacher_id: p[3], creator_id: p[4], is_ai: 1, ai_provider: p[5], status: 'inactive', sql: q }); return [{ insertId: s.courses.length }]; }
        if (q.startsWith('INSERT INTO course_content')) { s.lessons.push({ course: p[0], title: p[1], body: p[2], position: p[3], sql: q }); return [{ insertId: 1 }]; }
        if (q.startsWith('SELECT id, title, description, category, status, ai_provider, created_at FROM courses')) return [s.courses.filter((c) => c.id === p[0] && c.creator_id === p[1])];
        if (q.includes('FROM courses c WHERE c.is_ai = 1 AND c.creator_id = ?')) return [s.courses.filter((c) => c.creator_id === p[1]).map((c) => ({ ...c, lessons: s.lessons.filter((l) => l.course === c.id).length, students: s.others }))];
        if (q.startsWith('SELECT id, title, body, position FROM course_content')) return [s.lessons.filter((l) => l.course === p[0]).map((l, i) => ({ id: i + 1, ...l }))];
        if (q.startsWith("UPDATE courses SET status = 'active'")) { s.courses.find((c) => c.id === p[0]).status = 'active'; return [{}]; }
        if (q.startsWith("UPDATE courses SET status = 'inactive'")) { s.courses.find((c) => c.id === p[0]).status = 'inactive'; return [{}]; }
        if (q.startsWith('INSERT IGNORE INTO `groups`')) { s.groups++; return [{}]; }
        if (q.startsWith('SELECT id FROM `groups`')) return [[{ id: 1 }]];
        if (q.startsWith('INSERT IGNORE INTO group_members')) return [{}];
        if (q.startsWith("SELECT COUNT(*) AS n FROM course_enrollments")) return [[{ n: s.others }]];
        if (q.startsWith('DELETE FROM courses')) { s.courses = s.courses.filter((c) => c.id !== p[0]); return [{}]; }
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(() => {
    s = { courses: [], lessons: [], usage: {}, groups: 0, others: 0, failInsert: false };
    ['ANTHROPIC_API_KEY', 'AI_COURSE_DAILY_LIMIT', 'FEATURE_AI', 'REQUIRE_EMAIL_VERIFICATION'].forEach((k) => delete process.env[k]);
});
const make = (body = { topic: 'JavaScript asoslari' }, who = as(1)) => request(app).post('/api/ai-courses').set(who).send(body);

test('login is required', async () => {
    expect((await request(app).post('/api/ai-courses').send({ topic: 'abc' })).status).toBe(401);
    expect((await request(app).get('/api/ai-courses')).status).toBe(401);
});

test('a student can make a course: it is private, owned by them, with lessons as text (no url)', async () => {
    const r = await make({ topic: 'JavaScript asoslari', lessons: 4, level: 'o\'rta' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ courseId: 1, provider: 'demo', used: 1, remaining: 2 });
    expect(s.courses[0]).toMatchObject({ creator_id: 1, teacher_id: 1, status: 'inactive', is_ai: 1, ai_provider: 'demo' });
    expect(s.courses[0].sql).toContain("'inactive'");
    expect(s.lessons).toHaveLength(4);
    expect(s.lessons[0].sql).toContain("'lesson'");
    expect(s.lessons[0].body).toMatch(/Demo dars/);
});

test('brief is validated and bad input costs nothing', async () => {
    for (const bad of [{}, { topic: 'ab' }, { topic: 'x'.repeat(201) }, { topic: 'abc', lessons: 2 }, { topic: 'abc', lessons: 9 }, { topic: 'abc', lessons: 'x' }, { topic: 'abc', level: 'pro' }, { topic: 'abc', style: 5 }]) {
        expect((await make(bad)).status).toBe(400);
    }
    expect(s.usage[1]).toBeUndefined();
    expect(s.courses).toHaveLength(0);
});

test('the daily limit stops more courses; users are counted separately', async () => {
    process.env.AI_COURSE_DAILY_LIMIT = '2';
    expect((await make()).status).toBe(201);
    expect((await make()).status).toBe(201);
    const r = await make();
    expect(r.status).toBe(429);
    expect(r.body.remaining).toBe(0);
    expect((await make({ topic: 'Python' }, as(9))).status).toBe(201);
});

test('a failed AI call gives the credit back and stores no course', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'JSON emas' }] }) }));
    const r = await make();
    expect(r.status).toBe(502);
    expect(s.usage[1]).toBe(0);
    expect(s.courses).toHaveLength(0);
    // a later request still works (the lock is released)
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ title: 'JS', description: 'd', category: 'Dasturlash', lessons: [{ title: 'Kirish', body: 'Matn' }] }) }] }) }));
    const ok = await make();
    expect(ok.status).toBe(201);
    expect(ok.body.provider).toBe('claude');
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent.system).toMatch(/kurs yozuvchi/);
    expect(JSON.parse(sent.messages[0].content)).toMatchObject({ topic: 'JavaScript asoslari', lessons: 5 });
});

test('the model answer is cleaned before it is stored', () => {
    const text = 'Mana:\n' + JSON.stringify({ title: ' T '.repeat(200), description: 5, lessons: [{ title: 'A', body: 'x'.repeat(9000) }, { title: '', body: 'yo\'q' }, { title: 'B' }, { title: 'C', body: 'c' }] });
    const c = parseCourse(text, 2);
    expect(c.title.length).toBeLessThanOrEqual(255);
    expect(c.description).toBe('');
    expect(c.category).toBe('AI kurs');
    expect(c.lessons.map((l) => l.title)).toEqual(['A', 'C']);
    expect(c.lessons[0].body).toHaveLength(4000);
    expect(() => parseCourse('{"title":"x","lessons":[]}', 3)).toThrow();
});

test('only the creator sees the course and its lessons', async () => {
    await make();
    const mineList = await request(app).get('/api/ai-courses').set(as(1));
    expect(mineList.body.courses).toHaveLength(1);
    expect(mineList.body.courses[0]).toMatchObject({ public: false, demo: true, lessons: 5 });
    expect((await request(app).get('/api/ai-courses').set(as(9))).body.courses).toHaveLength(0);
    expect((await request(app).get('/api/ai-courses/1').set(as(1))).body.lessons).toHaveLength(5);
    expect((await request(app).get('/api/ai-courses/1').set(as(9))).status).toBe(404);
    expect((await request(app).get('/api/ai-courses/abc').set(as(1))).status).toBe(400);
});

test('demo courses cannot be made public; real ones can, and can go private again', async () => {
    await make();
    const demo = await request(app).patch('/api/ai-courses/1').set(as(1)).send({ public: true, confirmed: true });
    expect(demo.status).toBe(400);
    expect(demo.body.code).toBe('DEMO_COURSE');
    expect(s.courses[0].status).toBe('inactive');

    process.env.ANTHROPIC_API_KEY = 'k';
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ title: 'JS', lessons: [{ title: 'Kirish', body: 'Matn' }] }) }] }) }));
    await make();
    expect((await request(app).patch('/api/ai-courses/2').set(as(9)).send({ public: true, confirmed: true })).status).toBe(404);
    expect((await request(app).patch('/api/ai-courses/2').set(as(1)).send({ public: 'ha' })).status).toBe(400);
    // making it public needs the creator's explicit confirmation
    const noConfirm = await request(app).patch('/api/ai-courses/2').set(as(1)).send({ public: true });
    expect(noConfirm.status).toBe(400);
    expect(noConfirm.body.code).toBe('CONFIRM_REQUIRED');
    expect((await request(app).patch('/api/ai-courses/2').set(as(1)).send({ public: true, confirmed: 'ha' })).status).toBe(400);
    expect(s.courses[1].status).toBe('inactive');
    expect((await request(app).patch('/api/ai-courses/2').set(as(1)).send({ public: true, confirmed: true })).body).toEqual({ public: true });
    expect(s.courses[1].status).toBe('active');
    expect(s.groups).toBe(1);
    expect((await request(app).patch('/api/ai-courses/2').set(as(1)).send({ public: false })).body).toEqual({ public: false });
    expect(s.courses[1].status).toBe('inactive');
});

test('deleting: only yours, and not while other students are enrolled', async () => {
    await make();
    expect((await request(app).delete('/api/ai-courses/1').set(as(9))).status).toBe(404);
    s.others = 2;
    expect((await request(app).delete('/api/ai-courses/1').set(as(1))).status).toBe(409);
    expect(s.courses).toHaveLength(1);
    s.others = 0;
    expect((await request(app).delete('/api/ai-courses/1').set(as(1))).status).toBe(200);
    expect(s.courses).toHaveLength(0);
});

test('with REQUIRE_EMAIL_VERIFICATION an unconfirmed email cannot create', async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    const orig = fakeDb.execute;
    app.setDb({ ...fakeDb, execute: async (q, p) => (norm(q).startsWith('SELECT email_verified') ? [[{ email_verified: 0 }]] : orig(q, p)) });
    const r = await make();
    app.setDb(fakeDb);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EMAIL_NOT_VERIFIED');
});

test('feature flag off hides everything', async () => {
    process.env.FEATURE_AI = 'false';
    expect((await request(app).get('/api/ai-courses').set(as(1))).status).toBe(404);
});
