process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
let s;
// Course 1: teacher 8, items 10 and 11, students 1 and 2 enrolled. User 3 is a stranger.
const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT role, blocked')) return [[{ role: 'student', blocked: 0 }]];
        if (q.startsWith('SELECT id, teacher_id, creator_id FROM courses')) { const c = s.courses.find((x) => x.id === p[0]); return [c ? [c] : []]; }
        if (q.startsWith('SELECT 1 AS ok FROM course_enrollments')) return [s.enrolled.includes(p[0] + ':' + p[1]) ? [{ ok: 1 }] : []];
        if (q.startsWith('SELECT id, course_id FROM course_content WHERE id = ?')) { const i = s.items.find((x) => x.id === p[0]); return [i ? [i] : []]; }
        if (q.startsWith('SELECT q.id, q.user_id')) return [s.qs.filter((x) => x.item_id === p[0]).sort((a, b) => b.id - a.id).map((x) => ({ ...x, author: 'User ' + x.user_id }))];
        if (q.startsWith('SELECT COUNT(*) AS n FROM item_questions')) return [[{ n: s.qs.filter((x) => x.user_id === p[0] && x.course_id === p[1] && !x.answer).length }]];
        if (q.startsWith('INSERT INTO item_questions')) { s.qs.push({ id: s.qs.length + 1, course_id: p[0], item_id: p[1], user_id: p[2], body: p[3], answer: null }); return [{ insertId: s.qs.length }]; }
        if (q.startsWith('SELECT id, course_id, user_id FROM item_questions')) { const x = s.qs.find((y) => y.id === p[0]); return [x ? [x] : []]; }
        if (q.startsWith('UPDATE item_questions SET answer = ?')) { s.qs.find((y) => y.id === p[2]).answer = p[0]; return [{}]; }
        if (q.startsWith('UPDATE item_questions SET answer = NULL')) { s.qs.find((y) => y.id === p[0]).answer = null; return [{}]; }
        if (q.startsWith('DELETE FROM item_questions')) { s.qs = s.qs.filter((y) => y.id !== p[0]); return [{}]; }
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(() => {
    s = { courses: [{ id: 1, teacher_id: 8, creator_id: null }], items: [{ id: 10, course_id: 1 }, { id: 11, course_id: 1 }], enrolled: ['1:1', '1:2'], qs: [] };
});
const ask = (item, body, who = as(1)) => request(app).post(`/api/lesson-qa/items/${item}`).set(who).send({ body });
const list = (item, who = as(1)) => request(app).get(`/api/lesson-qa/items/${item}`).set(who);
const teacher = as(8, 'teacher');

test('login is required', async () => {
    expect((await request(app).get('/api/lesson-qa/items/10')).status).toBe(401);
});

test('a student asks; classmates and the teacher see it, "mine" is only for the author', async () => {
    expect((await ask(10, '  Bu nima?  ')).status).toBe(201);
    const mine = (await list(10)).body;
    expect(mine.questions).toHaveLength(1);
    expect(mine.questions[0]).toMatchObject({ body: 'Bu nima?', mine: true, answer: null });
    expect(mine.can_answer).toBe(false);
    expect((await list(10, as(2))).body.questions[0].mine).toBe(false);
    expect((await list(10, teacher)).body.can_answer).toBe(true);
    expect((await list(11)).body.questions).toEqual([]);
});

test('strangers see nothing and cannot ask; unknown item is 404', async () => {
    expect((await list(10, as(3))).status).toBe(404);
    expect((await ask(10, 'savol', as(3))).status).toBe(404);
    expect((await list(99)).status).toBe(404);
    expect((await list('abc')).status).toBe(400);
});

test('the teacher does not ask; empty and too long questions are refused', async () => {
    expect((await ask(10, 'savol', teacher)).status).toBe(403);
    expect((await ask(10, '   ')).status).toBe(400);
    expect((await ask(10, 'x'.repeat(501))).status).toBe(400);
});

test('at most 20 unanswered questions per student per course', async () => {
    for (let i = 0; i < 20; i++) expect((await ask(10, 'savol ' + i)).status).toBe(201);
    expect((await ask(10, 'yana')).status).toBe(429);
    expect((await ask(10, 'boshqa', as(2))).status).toBe(201);
});

test('only the teacher answers; an empty answer clears it', async () => {
    await ask(10, 'savol');
    const put = (a, who) => request(app).put('/api/lesson-qa/questions/1/answer').set(who).send({ answer: a });
    expect((await put('Javob', as(1))).status).toBe(403);
    expect((await put('Javob', as(3))).status).toBe(404);
    expect((await put('x'.repeat(2001), teacher)).status).toBe(400);
    expect((await put(5, teacher)).status).toBe(400);
    expect((await put('  Javob  ', teacher)).body).toEqual({ id: 1, answer: 'Javob' });
    expect((await list(10)).body.questions[0].answer).toBe('Javob');
    expect((await put('  ', teacher)).body.answer).toBeNull();
    expect((await request(app).put('/api/lesson-qa/questions/99/answer').set(teacher).send({ answer: 'x' })).status).toBe(404);
});

test('delete: the author or the teacher, nobody else', async () => {
    await ask(10, 'bir'); await ask(10, 'ikki', as(2));
    const del = (id, who) => request(app).delete('/api/lesson-qa/questions/' + id).set(who);
    expect((await del(2, as(1))).status).toBe(403);
    expect((await del(1, as(3))).status).toBe(404);
    expect((await del(1, as(1))).status).toBe(200);
    expect((await del(2, teacher)).status).toBe(200);
    expect(s.qs).toHaveLength(0);
});
