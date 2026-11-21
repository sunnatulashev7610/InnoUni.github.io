process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
let s;
// Course 1: teacher 8; items 10, 11. Course 2: AI course created by user 9 (teacher 9). User 1 and 2 are enrolled in course 1.
const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT role, blocked')) return [[{ role: 'student', blocked: 0 }]];
        if (q.startsWith('SELECT id, teacher_id, creator_id FROM courses')) { const c = s.courses.find((x) => x.id === p[0]); return [c ? [c] : []]; }
        if (q.startsWith('SELECT 1 AS ok FROM course_enrollments')) return [s.enrolled.includes(p[0] + ':' + p[1]) ? [{ ok: 1 }] : []];
        if (q.startsWith('SELECT item_id, body, bookmarked FROM item_notes')) return [s.notes.filter((n) => n.user === p[0] && n.course === p[1]).map((n) => ({ item_id: n.item, body: n.body, bookmarked: n.mark }))];
        if (q.startsWith('SELECT id, item_id, title, url FROM course_materials')) return [s.materials.filter((m) => m.course === p[0]).map(({ id, item, title, url }) => ({ id, item_id: item, title, url }))];
        if (q.startsWith('SELECT id, course_id FROM course_content WHERE id = ?')) { const i = s.items.find((x) => x.id === p[0]); return [i ? [i] : []]; }
        if (q.startsWith('SELECT id FROM course_content WHERE id = ? AND course_id = ?')) return [s.items.filter((x) => x.id === p[0] && x.course_id === p[1])];
        if (q.startsWith('SELECT body, bookmarked FROM item_notes')) return [s.notes.filter((n) => n.user === p[0] && n.item === p[1]).map((n) => ({ body: n.body, bookmarked: n.mark }))];
        if (q.startsWith('DELETE FROM item_notes')) { s.notes = s.notes.filter((n) => !(n.user === p[0] && n.item === p[1])); return [{}]; }
        if (q.startsWith('INSERT INTO item_notes')) { const n = s.notes.find((x) => x.user === p[0] && x.item === p[1]); if (n) { n.body = p[3]; n.mark = p[4]; } else s.notes.push({ user: p[0], item: p[1], course: p[2], body: p[3], mark: p[4] }); return [{}]; }
        if (q.startsWith('SELECT COUNT(*) AS n FROM course_materials')) return [[{ n: s.materials.filter((m) => m.course === p[0]).length }]];
        if (q.startsWith('INSERT INTO course_materials')) { s.materials.push({ id: s.materials.length + 1, course: p[0], item: p[1], title: p[2], url: p[3], by: p[4] }); return [{ insertId: s.materials.length }]; }
        if (q.startsWith('DELETE FROM course_materials')) { const n = s.materials.length; s.materials = s.materials.filter((m) => !(m.id === p[0] && m.course === p[1])); return [{ affectedRows: n - s.materials.length }]; }
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(() => {
    s = {
        courses: [{ id: 1, teacher_id: 8, creator_id: null }, { id: 2, teacher_id: 9, creator_id: 9 }],
        items: [{ id: 10, course_id: 1 }, { id: 11, course_id: 1 }, { id: 20, course_id: 2 }],
        enrolled: ['1:1', '1:2'], notes: [], materials: []
    };
});
const put = (item, body, who = as(1)) => request(app).put(`/api/course-tools/items/${item}/note`).set(who).send(body);
const addMat = (course, body, who = as(8, 'teacher')) => request(app).post(`/api/course-tools/courses/${course}/materials`).set(who).send(body);

test('login is required', async () => {
    expect((await request(app).get('/api/course-tools/courses/1')).status).toBe(401);
    expect((await request(app).put('/api/course-tools/items/10/note').send({ body: 'x' })).status).toBe(401);
});

describe('notes and bookmarks', () => {
    test('an enrolled student saves a note, a bookmark, and gets only their own back', async () => {
        expect((await put(10, { body: '  Muhim joy  ' })).body).toEqual({ item_id: 10, body: 'Muhim joy', bookmarked: false });
        expect((await put(11, { bookmarked: true })).body).toEqual({ item_id: 11, body: '', bookmarked: true });
        await put(10, { body: 'Boshqa odam' }, as(2));
        const r = await request(app).get('/api/course-tools/courses/1').set(as(1));
        expect(r.body.notes).toEqual([{ item_id: 10, body: 'Muhim joy', bookmarked: false }, { item_id: 11, body: '', bookmarked: true }]);
        expect(r.body.can_manage).toBe(false);
    });
    test('changing only the bookmark keeps the note, and the other way round', async () => {
        await put(10, { body: 'matn' }); await put(10, { bookmarked: true });
        expect((await put(10, { bookmarked: true })).body).toMatchObject({ body: 'matn', bookmarked: true });
        expect((await put(10, { body: 'yangi' })).body).toMatchObject({ body: 'yangi', bookmarked: true });
    });
    test('an empty note without a bookmark removes the row', async () => {
        await put(10, { body: 'matn' });
        expect((await put(10, { body: '   ' })).body).toEqual({ item_id: 10, body: '', bookmarked: false });
        expect(s.notes).toHaveLength(0);
    });
    test('validation: too long, wrong types, nothing to save', async () => {
        expect((await put(10, { body: 'x'.repeat(2001) })).status).toBe(400);
        expect((await put(10, { body: 5 })).status).toBe(400);
        expect((await put(10, { bookmarked: 'ha' })).status).toBe(400);
        expect((await put(10, {})).status).toBe(400);
        expect((await put('abc', { body: 'x' })).status).toBe(400);
        expect((await put(10, { body: 'x'.repeat(2000) })).status).toBe(200);
    });
    test('only people of the course: a stranger and a missing item are 404, nothing is stored', async () => {
        expect((await put(10, { body: 'x' }, as(5))).status).toBe(404);
        expect((await put(999, { body: 'x' })).status).toBe(404);
        expect((await put(20, { body: 'x' })).status).toBe(404);
        expect(s.notes).toHaveLength(0);
    });
});

describe('materials', () => {
    test('the teacher attaches a link to the course and to an item; enrolled students read them', async () => {
        expect((await addMat(1, { title: 'Slaydlar', url: 'https://example.com/a.pdf' })).status).toBe(201);
        const r = await addMat(1, { title: 'Misollar', url: 'https://example.com/b', item_id: 10 });
        expect(r.body).toMatchObject({ item_id: 10, title: 'Misollar' });
        const read = await request(app).get('/api/course-tools/courses/1').set(as(1));
        expect(read.body.materials).toEqual([{ id: 1, item_id: null, title: 'Slaydlar', url: 'https://example.com/a.pdf' }, { id: 2, item_id: 10, title: 'Misollar', url: 'https://example.com/b' }]);
        const teacher = await request(app).get('/api/course-tools/courses/1').set(as(8, 'teacher'));
        expect(teacher.body.can_manage).toBe(true);
    });
    test('the creator of an AI course manages materials too', async () => {
        expect((await addMat(2, { title: 'Havola', url: 'https://example.com' }, as(9))).status).toBe(201);
    });
    test('students and strangers cannot add or remove', async () => {
        expect((await addMat(1, { title: 'x', url: 'https://example.com' }, as(1))).status).toBe(404);
        expect((await addMat(1, { title: 'x', url: 'https://example.com' }, as(77, 'teacher'))).status).toBe(404);
        await addMat(1, { title: 'x', url: 'https://example.com' });
        expect((await request(app).delete('/api/course-tools/courses/1/materials/1').set(as(1))).status).toBe(404);
        expect(s.materials).toHaveLength(1);
        expect((await request(app).delete('/api/course-tools/courses/1/materials/1').set(as(8, 'teacher'))).status).toBe(200);
        expect((await request(app).delete('/api/course-tools/courses/1/materials/1').set(as(8, 'teacher'))).status).toBe(404);
    });
    test('only http(s) links, a title, an item of the same course', async () => {
        for (const bad of [{ title: 'x', url: 'javascript:alert(1)' }, { title: 'x', url: 'ftp://a.b/c' }, { title: 'x', url: 'salom' }, { title: '', url: 'https://a.b' }, { url: 'https://a.b' }, { title: 'x'.repeat(201), url: 'https://a.b' }, { title: 'x', url: 'https://a.b', item_id: 'q' }]) {
            expect((await addMat(1, bad)).status).toBe(400);
        }
        expect((await addMat(1, { title: 'x', url: 'https://a.b', item_id: 20 })).status).toBe(404); // item of another course
        expect(s.materials).toHaveLength(0);
    });
    test('a course holds at most 60 materials', async () => {
        for (let i = 0; i < 60; i++) s.materials.push({ id: i + 1, course: 1, item: null, title: 't', url: 'https://a.b' });
        expect((await addMat(1, { title: 'x', url: 'https://a.b' })).status).toBe(400);
    });
    test('a stranger cannot read the course tools', async () => {
        expect((await request(app).get('/api/course-tools/courses/1').set(as(5))).status).toBe(404);
        expect((await request(app).get('/api/course-tools/courses/abc').set(as(1))).status).toBe(400);
    });
});
