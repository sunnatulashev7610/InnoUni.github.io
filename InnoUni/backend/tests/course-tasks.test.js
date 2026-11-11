process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

let s;
const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role) => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const reset = () => { s = { tasks: [], enrolled: [{ c: 10, u: 5 }], rows: [] }; };

const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT id FROM courses WHERE id = ? AND teacher_id = ?')) return [p[0] === 10 && p[1] === 2 ? [{ id: 10 }] : []];
        if (q.startsWith('SELECT id FROM course_enrollments WHERE course_id = ? AND user_id = ?')) return [s.enrolled.filter((e) => e.c === p[0] && e.u === p[1]).map(() => ({ id: 1 }))];
        if (q.startsWith('INSERT INTO tasks')) { s.tasks.push({ title: p[0], description: p[1], course_id: p[2], priority: p[3], due_date: p[4], assigned_to: p[5] }); return [{ insertId: s.tasks.length }]; }
        if (q.startsWith('SELECT id, title, description, category, status FROM courses WHERE id = ? AND teacher_id = ?') || q.includes('FROM courses WHERE id = ? AND teacher_id = ?')) return [p[0] === 10 && p[1] === 2 ? [{ id: 10, title: 'Py', description: '', category: 'x', status: 'active' }] : []];
        if (q.includes('FROM tasks t WHERE t.course_id = ?')) return [[{ id: 1, title: 'T', description: null, assigned_to: null, due_date: '2026-12-01', submitted: '2', graded: '1', students: '4' }]];
        if (q.includes('FROM tasks t JOIN courses c ON c.id = t.course_id LEFT JOIN course_enrollments ce')) return [s.rows];
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(reset);

const create = (body, user = as(2, 'teacher')) => request(app).post('/api/teacher/tasks').set(user).send(body);

describe('creating tasks', () => {
    test('a course task: no assigned student, trimmed title, default priority', async () => {
        const r = await create({ course_id: 10, title: '  Essay  ', due_date: '2026-12-01' });
        expect(r.status).toBe(201);
        expect(s.tasks[0]).toMatchObject({ title: 'Essay', description: null, priority: 'medium', due_date: '2026-12-01', assigned_to: null });
    });
    test('validation', async () => {
        expect((await create({ course_id: 10 })).status).toBe(400);                                  // no title
        expect((await create({ course_id: 10, title: 'x', due_date: '2026-02-30' })).status).toBe(400); // impossible date
        expect((await create({ course_id: 10, title: 'x', due_date: 'tomorrow' })).status).toBe(400);
        expect((await create({ course_id: 10, title: 'x', priority: 'urgent' })).status).toBe(400);
        expect((await create({ course_id: 'a', title: 'x' })).status).toBe(400);
        expect((await create({ course_id: 10, title: 'x', assigned_to: 99 })).status).toBe(400);     // not enrolled
        expect(s.tasks).toHaveLength(0);
    });
    test("another teacher's course and students are refused", async () => {
        expect((await create({ course_id: 10, title: 'x' }, as(3, 'teacher'))).status).toBe(403);
        expect((await create({ course_id: 10, title: 'x' }, as(5, 'student'))).status).toBe(403);
    });
    test('assigning to an enrolled student works', async () => {
        expect((await create({ course_id: 10, title: 'x', assigned_to: 5 })).status).toBe(201);
        expect(s.tasks[0].assigned_to).toBe(5);
    });
});

test('teacher sees course tasks with counts as numbers, only for own course', async () => {
    const r = await request(app).get('/api/teacher/courses/10/tasks').set(as(2, 'teacher'));
    expect(r.body.tasks[0]).toEqual({ id: 1, title: 'T', description: null, assignedTo: null, dueDate: '2026-12-01', submitted: 2, graded: 1, students: 4 });
    expect((await request(app).get('/api/teacher/courses/10/tasks').set(as(3, 'teacher'))).status).toBe(404);
});

test('student task list maps status, grade and keeps numbers as numbers', async () => {
    s.rows = [
        { id: 1, title: 'A', description: 'd', course_id: 10, course_title: 'Py', due_date: '2026-12-01', sub_status: null, grade: null, feedback: null, content: null, submitted_at: null },
        { id: 2, title: 'B', description: null, course_id: 10, course_title: 'Py', due_date: null, sub_status: 'graded', grade: '95.50', feedback: 'Zo\'r', content: 'ans', submitted_at: 'x' },
        { id: 3, title: 'C', description: null, course_id: 10, course_title: 'Py', due_date: null, sub_status: 'submitted', grade: null, feedback: null, content: 'ans', submitted_at: 'x' }
    ];
    const r = await request(app).get('/api/student/tasks').set(as(5, 'student'));
    expect(r.body.tasks.map((t) => [t.status, t.grade])).toEqual([['todo', null], ['graded', 95.5], ['submitted', null]]);
    expect((await request(app).get('/api/student/tasks').set(as(2, 'teacher'))).status).toBe(403);
});
