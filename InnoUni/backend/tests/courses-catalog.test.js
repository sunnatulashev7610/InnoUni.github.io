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
        { id: 2, title: 'Python', description: 'd', category: 'Backend', avatar: null, ai: false, teacher: 'Bekzod', students: 3, enrolled: true, progress: 45.5 },
        { id: 1, title: 'React', description: 'd', category: 'Frontend', avatar: null, ai: false, teacher: null, students: 0, enrolled: false, progress: 0 }
    ]);
    expect(calls[0].p).toEqual([5]); // only the caller's own enrollment is joined
});

const cat = () => calls.find((x) => x.sql.includes('FROM courses c'));
describe('search and sort', () => {
    test('a search word becomes four LIKE parameters, with % and _ escaped; the sort is picked from a list', async () => {
        const res = await request(app).get('/api/student/courses').query({ q: '  50%_off  ', sort: 'popular' }).set(as(5, 'student'));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ q: '50%_off', sort: 'popular' });
        expect(cat().p).toEqual([5, '%50\\%\\_off%', '%50\\%\\_off%', '%50\\%\\_off%', '%50\\%\\_off%']);
        expect(cat().sql).toContain('ORDER BY students DESC, c.id DESC');
        expect(cat().sql).toContain('c.title LIKE ?');
    });
    test('no search: no LIKE and the newest first; an unknown sort is ignored and never reaches the SQL', async () => {
        await request(app).get('/api/student/courses').query({ sort: 'id; DROP TABLE courses' }).set(as(5, 'student'));
        expect(cat().sql).toContain('ORDER BY c.id DESC');
        expect(cat().sql).not.toContain('LIKE'); expect(cat().sql).not.toContain('DROP');
        expect(cat().p).toEqual([5]);
    });
    test('sorting by title, and a very long search word is cut to 100 characters', async () => {
        await request(app).get('/api/student/courses').query({ sort: 'title', q: 'a'.repeat(300) }).set(as(5, 'student'));
        expect(cat().sql).toContain('ORDER BY c.title ASC');
        expect(cat().p[1]).toBe('%' + 'a'.repeat(100) + '%');
    });
});

test('requires login and a student role', async () => {
    expect((await request(app).get('/api/student/courses')).status).toBe(401);
    expect((await request(app).get('/api/student/courses').set(as(9, 'teacher'))).status).toBe(403);
});

describe('course content for an enrolled student', () => {
    let enrolled; let aiCourse = false;
    beforeAll(() => {
        app.setDb({
            async execute(sql, p = []) {
                const q = sql.replace(/\s+/g, ' ').trim();
                calls.push({ sql: q, p });
                if (q.includes('JOIN course_enrollments ce ON ce.course_id = c.id AND ce.user_id = ?')) {
                    return [enrolled && p[0] === 5 && p[1] === 2 ? [{ id: 2, title: 'Python', description: 'd', category: 'Backend', teacher: 'Bekzod', my_progress: '10.00', is_ai: aiCourse ? 1 : 0 }] : []];
                }
                if (q.startsWith('SELECT id, kind, title, url, body, position FROM course_content')) return [[{ id: 1, kind: 'video', title: 'V', url: 'https://y.be/1', body: null, position: 1 }, { id: 2, kind: 'lesson', title: 'L', url: null, body: 'dars matni', position: 2 }]];
                if (q.startsWith('SELECT item_id FROM course_resume')) return [resume === null ? [] : [{ item_id: resume }]];
                if (q.includes('FROM course_content cc JOIN course_enrollments ce')) return [enrolled && p[0] === 5 && p[1] === 1 && p[2] === 2 ? [{ ok: 1 }] : []];
                if (q.startsWith('INSERT INTO course_resume')) { saved.push(p); return [{}]; }
                throw new Error('Unexpected query: ' + q);
            },
            query: async () => [[]]
        });
    });
    afterAll(() => app.setDb(fakeDb));
    let resume = null; const saved = [];
    beforeEach(() => { resume = null; saved.length = 0; });

    test('the content tells where the student stopped last time', async () => {
        enrolled = true; resume = 2;
        expect((await request(app).get('/api/student/courses/2/content').set(as(5, 'student'))).body.resume).toBe(2);
        resume = null;
        expect((await request(app).get('/api/student/courses/2/content').set(as(5, 'student'))).body.resume).toBeNull();
    });

    test('resume is saved only for an item of a course the student is enrolled in', async () => {
        enrolled = true;
        const ok = await request(app).put('/api/student/courses/2/resume').set(as(5, 'student')).send({ item_id: 1 });
        expect(ok.status).toBe(200); expect(saved).toEqual([[5, 2, 1]]);
        saved.length = 0;
        expect((await request(app).put('/api/student/courses/2/resume').set(as(5, 'student')).send({ item_id: 99 })).status).toBe(404);
        expect((await request(app).put('/api/student/courses/2/resume').set(as(5, 'student')).send({ item_id: 'x' })).status).toBe(400);
        expect((await request(app).put('/api/student/courses/abc/resume').set(as(5, 'student')).send({ item_id: 1 })).status).toBe(400);
        enrolled = false;
        expect((await request(app).put('/api/student/courses/2/resume').set(as(5, 'student')).send({ item_id: 1 })).status).toBe(404);
        expect(saved).toEqual([]);
        expect((await request(app).put('/api/student/courses/2/resume').send({ item_id: 1 })).status).toBe(401);
    });

    test('enrolled student gets course and items', async () => {
        enrolled = true;
        const res = await request(app).get('/api/student/courses/2/content').set(as(5, 'student'));
        expect(res.status).toBe(200);
        expect(res.body.course).toMatchObject({ id: 2, teacher: 'Bekzod', progress: 10 });
        expect(res.body.items).toHaveLength(2);
        expect(res.body.items[1].body).toBe('dars matni');
    });

    test('an AI course does not hand out its lesson texts: they are taught through the lesson flow', async () => {
        enrolled = true; aiCourse = true;
        const res = await request(app).get('/api/student/courses/2/content').set(as(5, 'student'));
        aiCourse = false;
        expect(res.body.course.ai).toBe(true);
        expect(res.body.items.find((i) => i.kind === 'lesson')).toMatchObject({ title: 'L', body: null });
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
