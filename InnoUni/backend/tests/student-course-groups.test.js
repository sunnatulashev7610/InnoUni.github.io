process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

let s;
const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const reset = () => { s = { enrolled: [], groups: [], members: [], courseGroup: true }; };

const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT id FROM course_enrollments')) return [s.enrolled.filter((e) => e.c === p[0] && e.u === p[1])];
        if (q.startsWith('SELECT id, title, description, teacher_id FROM courses')) return [[{ id: 7, title: 'Py', description: 'd', teacher_id: 2 }]];
        if (q.startsWith('INSERT INTO course_enrollments')) { s.enrolled.push({ c: p[0], u: p[1] }); return [{}]; }
        if (q.startsWith('INSERT IGNORE INTO `groups`')) { if (!s.groups.some((g) => g.course_id === p[3])) s.groups.push({ id: 50, course_id: p[3] }); return [{}]; }
        if (q.startsWith('SELECT id FROM `groups` WHERE course_id = ?')) return [s.groups.filter((g) => g.course_id === p[0])];
        if (q.startsWith('INSERT IGNORE INTO group_members')) { s.members.push({ g: p[0], u: p[1] }); return [{}]; }
        if (q.startsWith('SELECT id FROM group_members WHERE group_id = ?')) return [[]];
        if (q.startsWith('SELECT id, course_id FROM `groups` WHERE id = ?')) return [[{ id: p[0], course_id: Number(p[0]) === 50 ? 7 : null }]];
        if (q.startsWith('SELECT course_id FROM `groups` WHERE id = ?')) return [[{ course_id: Number(p[0]) === 50 ? 7 : null }]];
        if (q.includes('FROM group_members gm JOIN `groups` g ON g.id = gm.group_id WHERE gm.user_id = ?')) {
            return [[{ id: 50, name: 'Py', description: 'd', course_id: 7, role: 'member', members: '3' }]];
        }
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};

beforeAll(() => app.setDb(fakeDb));
beforeEach(reset);

test('enrolling creates the course group (if missing) and adds the student', async () => {
    const res = await request(app).post('/api/student/courses/7/enroll').set(as(5));
    expect(res.status).toBe(200);
    expect(s.groups).toEqual([{ id: 50, course_id: 7 }]);
    expect(s.members).toEqual(expect.arrayContaining([{ g: 50, u: 5 }, { g: 50, u: 2 }]));
});

test('a course group cannot be joined or left by hand', async () => {
    const join = await request(app).post('/api/student/groups/50/join').set(as(5));
    expect(join.status).toBe(400);
    expect(join.body.error).toMatch(/enrolling/);
    const leave = await request(app).post('/api/student/groups/50/leave').set(as(5));
    expect(leave.status).toBe(400);
});

test('my groups lists course groups with numbers as numbers', async () => {
    const res = await request(app).get('/api/student/groups').set(as(5));
    expect(res.status).toBe(200);
    expect(res.body.groups).toEqual([{ id: 50, name: 'Py', description: 'd', courseId: 7, role: 'member', members: 3 }]);
    expect((await request(app).get('/api/student/groups').set(as(9, 'teacher'))).status).toBe(403);
});
