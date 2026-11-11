process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { validateUrl } = require('../utils/validation');

const T1 = 2, T2 = 3, STUDENT = 5;
let s;
const reset = () => { s = { courses: [], content: [], id: 1 }; };
const norm = (q) => q.replace(/\s+/g, ' ').trim();

const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('INSERT INTO courses')) {
            const c = { id: s.id++, title: p[0], description: p[1], category: p[2], teacher_id: p[3], status: 'inactive' };
            s.courses.push(c); return [{ insertId: c.id }];
        }
        if (q.startsWith('SELECT id, title, description, category, status FROM courses WHERE id = ? AND teacher_id = ?')) {
            return [s.courses.filter((c) => c.id === p[0] && c.teacher_id === p[1])];
        }
        if (q.startsWith('SELECT c.id, c.title')) {
            return [s.courses.filter((c) => c.teacher_id === p[0]).map((c) => ({
                ...c, videos: String(s.content.filter((x) => x.course_id === c.id && x.kind === 'video').length),
                guides: String(s.content.filter((x) => x.course_id === c.id && x.kind === 'guide').length), students: '0'
            }))];
        }
        if (q.startsWith('SELECT COUNT(*) AS n, COALESCE(MAX(position)')) {
            const items = s.content.filter((x) => x.course_id === p[0]);
            return [[{ n: items.length, last: items.reduce((m, x) => Math.max(m, x.position), 0) }]];
        }
        if (q.startsWith('SELECT COUNT(*) AS n FROM course_content')) return [[{ n: s.content.filter((x) => x.course_id === p[0]).length }]];
        if (q.startsWith('INSERT INTO course_content')) {
            const x = { id: s.id++, course_id: p[0], kind: p[1], title: p[2], url: p[3], position: p[4] };
            s.content.push(x); return [{ insertId: x.id }];
        }
        if (q.startsWith('SELECT id, kind, title, url, position FROM course_content')) {
            return [s.content.filter((x) => x.course_id === p[0]).sort((a, b) => a.position - b.position)];
        }
        if (q.startsWith('SELECT id, kind, position FROM course_content WHERE course_id = ?')) {
            return [s.content.filter((x) => x.course_id === p[0]).sort((a, b) => a.position - b.position).map((x) => ({ id: x.id, kind: x.kind, position: x.position }))];
        }
        if (q.startsWith('UPDATE course_content SET position')) { s.content.find((x) => x.id === p[1]).position = p[0]; return [{}]; }
        if (q.startsWith('DELETE FROM course_content')) {
            const n = s.content.length;
            s.content = s.content.filter((x) => !(x.id === p[0] && x.course_id === p[1]));
            return [{ affectedRows: n - s.content.length }];
        }
        if (q.startsWith('UPDATE courses SET')) {
            const c = s.courses.find((x) => x.id === p[p.length - 1]);
            q.slice('UPDATE courses SET '.length, q.indexOf(' WHERE')).split(', ').forEach((part, i) => { c[part.replace(' = ?', '')] = p[i]; });
            return [{}];
        }
        throw new Error('Unexpected query in test: ' + q);
    },
    query: async () => [[]]
};
const as = (userId, role = 'teacher') => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });

beforeAll(() => app.setDb(fakeDb));
beforeEach(reset);

const make = (user = T1, body = { title: 'Python', category: 'Backend', description: 'd' }) => request(app).post('/api/teacher/courses').set(as(user)).send(body);
const add = (id, body, user = T1) => request(app).post(`/api/teacher/courses/${id}/content`).set(as(user)).send(body);
const video = { kind: 'video', title: 'Kirish', url: 'https://youtu.be/abc' };

describe('create and list', () => {
    test('a new course is a draft owned by the teacher', async () => {
        const res = await make();
        expect(res.status).toBe(201);
        expect(s.courses[0]).toMatchObject({ teacher_id: T1, status: 'inactive', title: 'Python' });
    });
    test('validates title and category; students are refused', async () => {
        expect((await make(T1, { title: ' ', category: 'x' })).status).toBe(400);
        expect((await make(T1, { title: 'x' })).status).toBe(400);
        expect((await request(app).post('/api/teacher/courses').set(as(STUDENT, 'student')).send({ title: 'x', category: 'y' })).status).toBe(403);
    });
    test('lists only my courses with counts as numbers', async () => {
        await make(T1); await make(T2, { title: 'Other', category: 'x' });
        await add(1, video); await add(1, { kind: 'guide', title: 'PDF', url: 'https://x.uz/a.pdf' });
        const res = await request(app).get('/api/teacher/courses').set(as(T1));
        expect(res.body.courses).toHaveLength(1);
        expect(res.body.courses[0]).toMatchObject({ videos: 1, guides: 1, students: 0, status: 'inactive' });
    });
});

describe('content', () => {
    test('adds items in order and returns them', async () => {
        await make();
        await add(1, video);
        await add(1, { kind: 'guide', title: 'Qo\'llanma', url: 'https://x.uz/g.pdf' });
        const res = await request(app).get('/api/teacher/courses/1/content').set(as(T1));
        expect(res.body.items.map((i) => [i.kind, i.position])).toEqual([['video', 1], ['guide', 2]]);
    });
    test('rejects bad kind, empty title and unsafe or invalid links', async () => {
        await make();
        expect((await add(1, { ...video, kind: 'audio' })).status).toBe(400);
        expect((await add(1, { ...video, title: '' })).status).toBe(400);
        expect((await add(1, { ...video, url: 'javascript:alert(1)' })).status).toBe(400);
        expect((await add(1, { ...video, url: 'not a link' })).status).toBe(400);
        expect((await add(1, { ...video, url: 'ftp://x.uz/a' })).status).toBe(400);
        expect(s.content).toHaveLength(0);
    });
    test("another teacher cannot read or change my course", async () => {
        await make(T1);
        expect((await add(1, video, T2)).status).toBe(404);
        expect((await request(app).get('/api/teacher/courses/1/content').set(as(T2))).status).toBe(404);
        expect((await request(app).put('/api/teacher/courses/1').set(as(T2)).send({ title: 'Hacked' })).status).toBe(404);
        expect(s.courses[0].title).toBe('Python');
    });
    test('move swaps neighbours and ignores the ends', async () => {
        await make();
        await add(1, video); await add(1, { ...video, title: 'Ikkinchi' });
        const mv = (id, direction) => request(app).post(`/api/teacher/courses/1/content/${id}/move`).set(as(T1)).send({ direction });
        await mv(3, 'up');
        expect(s.content.sort((a, b) => a.position - b.position).map((x) => x.title)).toEqual(['Ikkinchi', 'Kirish']);
        expect((await mv(3, 'up')).status).toBe(200);
        expect((await mv(3, 'sideways')).status).toBe(400);
    });
    test('move never swaps a video with a guide', async () => {
        await make();
        await add(1, video);                                                         // id 2, pos 1
        await add(1, { kind: 'guide', title: 'G', url: 'https://x.uz/g.pdf' });      // id 3, pos 2
        await add(1, { ...video, title: 'V2' });                                     // id 4, pos 3
        await request(app).post('/api/teacher/courses/1/content/4/move').set(as(T1)).send({ direction: 'up' });
        const order = s.content.sort((a, b) => a.position - b.position).map((x) => x.title);
        expect(order).toEqual(['V2', 'G', 'Kirish']);
    });
    test('delete works, but a published course keeps at least one item', async () => {
        await make();
        await add(1, video);
        await request(app).put('/api/teacher/courses/1').set(as(T1)).send({ status: 'active' });
        const del = () => request(app).delete('/api/teacher/courses/1/content/2').set(as(T1));
        expect((await del()).status).toBe(400);
        await request(app).put('/api/teacher/courses/1').set(as(T1)).send({ status: 'inactive' });
        expect((await del()).status).toBe(200);
        expect((await del()).status).toBe(404);
    });
});

describe('update and publish', () => {
    test('partial update changes only what is sent', async () => {
        await make();
        expect((await request(app).put('/api/teacher/courses/1').set(as(T1)).send({ title: 'Yangi nom' })).status).toBe(200);
        expect(s.courses[0]).toMatchObject({ title: 'Yangi nom', category: 'Backend' });
        expect((await request(app).put('/api/teacher/courses/1').set(as(T1)).send({})).status).toBe(400);
        expect((await request(app).put('/api/teacher/courses/1').set(as(T1)).send({ status: 'archived' })).status).toBe(400);
    });
    test('cannot publish an empty course; can once it has content', async () => {
        await make();
        const pub = () => request(app).put('/api/teacher/courses/1').set(as(T1)).send({ status: 'active' });
        expect((await pub()).status).toBe(400);
        await add(1, video);
        expect((await pub()).status).toBe(200);
        expect(s.courses[0].status).toBe('active');
    });
});

test('validateUrl normalises and rejects', () => {
    expect(validateUrl('  https://youtu.be/abc ').value).toBe('https://youtu.be/abc');
    expect(validateUrl('data:text/html,x').error).toBeDefined();
    expect(validateUrl('https://x.uz/' + 'a'.repeat(500)).error).toMatch(/at most/);
    expect(validateUrl(null).error).toBeDefined();
});
