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
        if (q.startsWith('SELECT role, blocked')) return [[{ role: p[0] === 2 ? 'teacher' : 'student', blocked: 0 }]];
        if (q.startsWith('INSERT IGNORE INTO ai_course_usage')) { s.usage[p[0]] = s.usage[p[0]] || 0; return [{ affectedRows: 1 }]; }
        if (q.startsWith('UPDATE ai_course_usage SET used = used + 1')) { if (s.usage[p[0]] < p[1]) { s.usage[p[0]]++; return [{ affectedRows: 1 }]; } return [{ affectedRows: 0 }]; }
        if (q.startsWith('UPDATE ai_course_usage SET used = used - 1')) { if (s.usage[p[0]] > 0) s.usage[p[0]]--; return [{ affectedRows: 1 }]; }
        if (q.startsWith('SELECT used FROM ai_course_usage')) return [s.usage[p[0]] === undefined ? [] : [{ used: s.usage[p[0]] }]];
        if (q.startsWith('INSERT INTO courses')) { if (s.failInsert) throw new Error('db down'); s.courses.push({ id: s.courses.length + 1, title: p[0], description: p[1], category: p[2], teacher_id: p[3], creator_id: p[4], is_ai: 1, ai_provider: p[5], status: p[6], sql: q }); return [{ insertId: s.courses.length }]; }
        if (q.startsWith('INSERT INTO course_content')) { s.lessons.push({ course: p[0], title: p[1], body: p[2], position: p[3], sql: q }); return [{ insertId: 1 }]; }
        if (q.startsWith('SELECT id, title, description, category, status, ai_provider, created_at FROM courses')) return [s.courses.filter((c) => c.id === p[0] && c.creator_id === p[1])];
        if (q.includes('FROM courses c WHERE c.is_ai = 1 AND c.creator_id = ?')) return [s.courses.filter((c) => c.creator_id === p[1]).map((c) => ({ ...c, lessons: s.lessons.filter((l) => l.course === c.id).length, students: s.others, reports: s.reports.filter((r) => r.course_id === c.id && r.status === 'open').length }))];
        if (q.startsWith('SELECT id, title, body, position FROM course_content')) return [s.lessons.filter((l) => l.course === p[0]).map((l, i) => ({ id: i + 1, ...l }))];
        if (q.startsWith("UPDATE courses SET status = 'active'")) { s.courses.find((c) => c.id === p[0]).status = 'active'; return [{}]; }
        if (q.startsWith("UPDATE courses SET status = 'inactive'")) { s.courses.find((c) => c.id === p[0]).status = 'inactive'; return [{}]; }
        if (q.startsWith('INSERT IGNORE INTO `groups`')) { s.groups++; return [{}]; }
        if (q.startsWith('SELECT id FROM `groups`')) return [[{ id: 1 }]];
        if (q.startsWith('INSERT IGNORE INTO group_members')) return [{}];
        if (q.startsWith("SELECT COUNT(*) AS n FROM course_enrollments")) return [[{ n: s.others }]];
        if (q.startsWith('DELETE FROM courses')) { s.courses = s.courses.filter((c) => c.id !== p[0]); return [{}]; }
        if (q.startsWith("SELECT id, creator_id FROM courses WHERE id = ? AND is_ai = 1 AND status = 'active'")) return [s.courses.filter((c) => c.id === p[0] && c.status === 'active')];
        if (q.startsWith('SELECT 1 AS ok FROM course_enrollments')) return [s.enrolled.includes(p[0] + ':' + p[1]) ? [{ ok: 1 }] : []];
        if (q.startsWith('SELECT id FROM course_content WHERE id = ? AND course_id = ?')) { const l = s.lessons[p[0] - 1]; return [l && l.course === p[1] ? [{ id: p[0] }] : []]; }
        if (q.startsWith('SELECT COUNT(*) AS n FROM ai_course_reports WHERE reporter_id')) return [[{ n: s.reports.filter((r) => r.reporter_id === p[0]).length }]];
        if (q.startsWith('SELECT 1 AS ok FROM ai_course_reports')) return [s.reports.filter((r) => r.course_id === p[0] && r.reporter_id === p[1] && r.status === 'open' && (r.lesson_id === p[3])).length ? [{ ok: 1 }] : []];
        if (q.startsWith("SELECT id FROM course_content WHERE id = ? AND course_id = ? AND kind = 'lesson'")) { const l = s.lessons[p[0] - 1]; return [l && l.course === p[1] ? [{ id: p[0] }] : []]; }
        if (q.startsWith('UPDATE course_content SET title')) { const l = s.lessons[p[2] - 1]; l.title = p[0]; l.body = p[1]; return [{ affectedRows: 1 }]; }
        if (q.startsWith('INSERT INTO ai_course_reports')) { s.reports.push({ id: s.reports.length + 1, course_id: p[0], lesson_id: p[1], reporter_id: p[2], message: p[3], status: 'open' }); return [{ insertId: s.reports.length }]; }
        if (q.startsWith('SELECT r.id, r.lesson_id')) return [s.reports.filter((r) => r.course_id === p[0] && r.status === 'open').map((r) => ({ id: r.id, lesson_id: r.lesson_id, lesson_title: r.lesson_id ? s.lessons[r.lesson_id - 1].title : null, message: r.message }))];
        if (q.startsWith("UPDATE ai_course_reports SET status = 'resolved'")) { const r = s.reports.find((x) => x.id === p[0] && x.course_id === p[1] && x.status === 'open'); if (r) r.status = 'resolved'; return [{ affectedRows: r ? 1 : 0 }]; }
        if (q.startsWith('DELETE FROM ai_course_reports')) { s.reports = s.reports.filter((r) => r.course_id !== p[0]); return [{}]; }
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(() => {
    s = { courses: [], lessons: [], usage: {}, groups: 0, others: 0, failInsert: false, enrolled: [], reports: [] };
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

test('demo courses cannot be made public; real ones can, only with confirmation, and can go private again', async () => {
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
    // a made course is private until the creator publishes it
    expect(s.courses[1].status).toBe('inactive');
    expect(s.groups).toBe(0);
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

describe('mistake reports', () => {
    // a public real AI course made by user 1, with lessons 1..1; user 5 is enrolled
    async function publicCourse() {
        process.env.ANTHROPIC_API_KEY = 'k';
        global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ title: 'JS', lessons: [{ title: 'Kirish', body: 'Matn' }, { title: 'Funksiya', body: 'Matn 2' }] }) }] }) }));
        await make();
        await request(app).patch('/api/ai-courses/1').set(as(1)).send({ public: true, confirmed: true });
        s.enrolled.push('1:5');
    }
    const report = (body, who = as(5)) => request(app).post('/api/ai-courses/1/reports').set(who).send(body);

    test('an enrolled student reports a mistake, the creator sees it and resolves it', async () => {
        await publicCourse();
        expect((await report({ message: 'Misol noto\'g\'ri ishlaydi', lesson_id: 2 })).status).toBe(201);
        expect((await report({ message: 'Umumiy tavsifda xato bor' })).status).toBe(201);
        const list = await request(app).get('/api/ai-courses/1/reports').set(as(1));
        expect(list.body.reports).toHaveLength(2);
        expect(list.body.reports.find((r) => r.lesson_id === 2)).toMatchObject({ lesson_title: 'Funksiya', message: 'Misol noto\'g\'ri ishlaydi' });
        expect(JSON.stringify(list.body)).not.toMatch(/reporter/);
        expect((await request(app).get('/api/ai-courses').set(as(1))).body.courses[0].reports).toBe(2);
        expect((await request(app).patch('/api/ai-courses/1/reports/1').set(as(9)).send({})).status).toBe(404);
        expect((await request(app).patch('/api/ai-courses/1/reports/1').set(as(1)).send({})).body).toEqual({ resolved: true });
        expect((await request(app).get('/api/ai-courses/1/reports').set(as(1))).body.reports).toHaveLength(1);
        expect((await request(app).patch('/api/ai-courses/1/reports/1').set(as(1)).send({})).status).toBe(404);
    });

    test('only people who may report can: students of the course, not the creator, not strangers', async () => {
        await publicCourse();
        expect((await report({ message: 'Xato bor shu yerda' }, as(8))).status).toBe(403);
        expect((await report({ message: 'Xato bor shu yerda' }, as(1))).status).toBe(400);
        expect((await request(app).get('/api/ai-courses/1/reports').set(as(5))).status).toBe(404);
        expect((await request(app).post('/api/ai-courses/99/reports').set(as(5)).send({ message: 'Xato bor shu yerda' })).status).toBe(404);
        expect((await request(app).post('/api/ai-courses/1/reports').send({ message: 'Xato bor shu yerda' })).status).toBe(401);
    });

    test('a private course cannot be reported; bad input is rejected', async () => {
        await publicCourse();
        await request(app).patch('/api/ai-courses/1').set(as(1)).send({ public: false });
        expect((await report({ message: 'Xato bor shu yerda' })).status).toBe(404);
        await request(app).patch('/api/ai-courses/1').set(as(1)).send({ public: true, confirmed: true });
        for (const bad of [{}, { message: 'xato' }, { message: 'x'.repeat(501) }, { message: 'Xato bor shu yerda', lesson_id: 'a' }]) expect((await report(bad)).status).toBe(400);
        expect((await report({ message: 'Xato bor shu yerda', lesson_id: 77 })).status).toBe(404);
        expect(s.reports).toHaveLength(0);
    });

    test('the same open report is not repeated, and there is a daily limit', async () => {
        await publicCourse();
        expect((await report({ message: 'Xato bor shu yerda', lesson_id: 1 })).status).toBe(201);
        expect((await report({ message: 'Yana shu xato', lesson_id: 1 })).status).toBe(409);
        for (let i = 0; i < 9; i++) s.reports.push({ id: 100 + i, course_id: 1, lesson_id: null, reporter_id: 5, message: 'x', status: 'resolved' });
        expect((await report({ message: 'Yana bir xato topdim', lesson_id: 2 })).status).toBe(429);
    });

    test('deleting the course removes its reports', async () => {
        await publicCourse();
        await report({ message: 'Xato bor shu yerda' });
        s.enrolled = [];
        await request(app).patch('/api/ai-courses/1').set(as(1)).send({ public: false });
        expect((await request(app).delete('/api/ai-courses/1').set(as(1))).status).toBe(200);
        expect(s.reports).toHaveLength(0);
    });
});

describe('lesson editing', () => {
    const put = (id, body, who = as(1)) => request(app).put('/api/ai-courses/1/lessons/' + id).set(who).send(body);
    test('the creator edits a lesson; others and bad input are refused', async () => {
        await make();
        expect((await put(2, { title: ' Yangi ', body: ' Tuzatilgan matn ' })).body).toEqual({ id: 2, title: 'Yangi', body: 'Tuzatilgan matn' });
        expect(s.lessons[1]).toMatchObject({ title: 'Yangi', body: 'Tuzatilgan matn' });
        expect((await put(2, { title: 'X', body: 'Y' }, as(9))).status).toBe(404);
        for (const bad of [{}, { title: 'A' }, { body: 'B' }, { title: '', body: 'B' }, { title: 'A', body: 'x'.repeat(4001) }, { title: 5, body: 'B' }]) expect((await put(2, bad)).status).toBe(400);
        expect((await put(99, { title: 'A', body: 'B' })).status).toBe(404);
        expect((await put('x', { title: 'A', body: 'B' })).status).toBe(400);
    });
});
