process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

let calls;
const rows = [
    { id: 2, title: 'Python', description: 'd', category: 'Backend', avatar: null, teacher: 'Bekzod', students: '3', my_progress: '45.50', my_status: 'active' },
    { id: 1, title: 'React', description: 'd', category: 'Frontend', avatar: null, teacher: null, students: 0, my_progress: null, my_status: null }
];
const fakeDb = {
    async execute(sql, p = []) {
        calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), p });
        if (/FROM courses c LEFT JOIN users u/.test(sql.replace(/\s+/g, ' '))) return [rows];
        throw new Error('Unexpected query: ' + sql);
    },
    query: async () => [[]]
};
const as = (userId, role) => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });

beforeAll(() => app.setDb(fakeDb));
beforeEach(() => { calls = []; });

test('students get the catalogue with their own enrollment and numbers as numbers', async () => {
    const res = await request(app).get('/api/student/courses').set(as(5, 'student'));
    expect(res.status).toBe(200);
    expect(res.body.courses).toEqual([
        { id: 2, title: 'Python', description: 'd', category: 'Backend', avatar: null, teacher: 'Bekzod', students: 3, enrolled: true, progress: 45.5 },
        { id: 1, title: 'React', description: 'd', category: 'Frontend', avatar: null, teacher: null, students: 0, enrolled: false, progress: 0 }
    ]);
    expect(calls[0].p).toEqual([5]); // only the caller's own enrollment is joined
});

test('requires login and a student role', async () => {
    expect((await request(app).get('/api/student/courses')).status).toBe(401);
    expect((await request(app).get('/api/student/courses').set(as(9, 'teacher'))).status).toBe(403);
});

describe('course content for an enrolled student', () => {
    let enrolled;
    beforeAll(() => {
        app.setDb({
            async execute(sql, p = []) {
                const q = sql.replace(/\s+/g, ' ').trim();
                calls.push({ sql: q, p });
                if (q.includes('JOIN course_enrollments ce ON ce.course_id = c.id AND ce.user_id = ?')) {
                    return [enrolled && p[0] === 5 && p[1] === 2 ? [{ id: 2, title: 'Python', description: 'd', category: 'Backend', teacher: 'Bekzod', my_progress: '10.00' }] : []];
                }
                if (q.startsWith('SELECT id, kind, title, url, position FROM course_content')) return [[{ id: 1, kind: 'video', title: 'V', url: 'https://y.be/1', position: 1 }]];
                throw new Error('Unexpected query: ' + q);
            },
            query: async () => [[]]
        });
    });
    afterAll(() => app.setDb(fakeDb));

    test('enrolled student gets course and items', async () => {
        enrolled = true;
        const res = await request(app).get('/api/student/courses/2/content').set(as(5, 'student'));
        expect(res.status).toBe(200);
        expect(res.body.course).toMatchObject({ id: 2, teacher: 'Bekzod', progress: 10 });
        expect(res.body.items).toHaveLength(1);
    });
    test('not enrolled -> 404 and no content is read', async () => {
        enrolled = false;
        calls.length = 0;
        const res = await request(app).get('/api/student/courses/2/content').set(as(5, 'student'));
        expect(res.status).toBe(404);
        expect(calls.some((c) => c.sql.includes('course_content'))).toBe(false);
    });
    test('bad id, teacher role and no login are rejected', async () => {
        expect((await request(app).get('/api/student/courses/abc/content').set(as(5, 'student'))).status).toBe(400);
        expect((await request(app).get('/api/student/courses/2/content').set(as(9, 'teacher'))).status).toBe(403);
        expect((await request(app).get('/api/student/courses/2/content')).status).toBe(401);
    });
});
