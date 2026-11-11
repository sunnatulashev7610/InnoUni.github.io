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
