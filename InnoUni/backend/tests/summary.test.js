process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

const as = (userId, role) => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const norm = (q) => q.replace(/\s+/g, ' ').trim();
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let data;
const reset = () => {
    data = {
        tasks: [
            { id: 1, due_date: day(-2), sub_status: null },     // overdue
            { id: 2, due_date: day(3), sub_status: null },      // due soon
            { id: 3, due_date: day(30), sub_status: null },     // later
            { id: 4, due_date: null, sub_status: 'submitted' },
            { id: 5, due_date: null, sub_status: 'graded' }
        ],
        avg: '87.46', empty: false
    };
};
const fakeDb = {
    async execute(raw) {
        const q = norm(raw);
        if (q.includes('FROM tasks t LEFT JOIN course_enrollments ce')) return [data.tasks];
        if (q.includes('FROM group_members WHERE user_id')) return [[{ n: '3' }]];
        if (q.startsWith('SELECT COUNT(*) AS n FROM orders WHERE user_id')) return [[{ n: '2' }]];
        if (q.includes('COUNT(CASE WHEN status = \'active\' THEN 1 END) AS active, COUNT(CASE WHEN status = \'completed\'')) return [[{ active: '2', done: '1' }]];
        if (q.includes('AVG(grade) AS avg FROM task_submissions')) return [[{ avg: data.empty ? null : data.avg }]];
        if (q.includes('FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id LEFT JOIN users u')) return [data.empty ? [] : [{ id: 1, title: 'Py', progress: '100.00', status: 'active', teacher: 'M' }, { id: 2, title: 'JS', progress: '40.50', status: 'active', teacher: 'M' }]];
        if (q.includes('FROM task_submissions s JOIN tasks t ON t.id = s.task_id JOIN courses c ON c.id = t.course_id WHERE s.student_id')) return [[{ task: 'T', course: 'Py', grade: '95.00', graded_at: 'x' }]];
        // teacher
        if (q.includes('FROM courses WHERE teacher_id = ?')) return [[{ active: '3', draft: '1' }]];
        if (q.includes('COUNT(DISTINCT ce.user_id)')) return [[{ n: '7' }]];
        if (q.startsWith('SELECT COUNT(*) AS n FROM tasks t JOIN courses c')) return [[{ n: '4' }]];
        if (q.includes('AS to_grade')) return [[{ to_grade: '5', graded: data.empty ? '0' : '6', avg: data.empty ? null : '80.25' }]];
        if (q.includes('FROM courses c WHERE c.teacher_id = ?')) return [[{ id: 1, title: 'Py', status: 'active', students: '7', tasks: '2', submitted: '9', avg_grade: null }]];
        if (q.includes("DATE_FORMAT(s.submitted_at, '%Y-%m-%d') AS d")) return [[{ d: day(0), n: '2' }]];
        if (q.includes("DATE_FORMAT(ce.enrolled_at, '%Y-%m-%d') AS d")) return [[{ d: day(0), n: '1' }, { d: day(-2), n: '4' }]];
        if (q.includes('s.submitted_at AS at')) return [[{ at: '2026-11-10T10:00:00Z', who: 'Ali', what: 'Essay' }]];
        if (q.includes('ce.enrolled_at AS at')) return [[{ at: '2026-11-11T10:00:00Z', who: 'Vali', what: 'Py' }]];
        if (q.includes('FROM orders o LEFT JOIN courses c')) return [[{ n: '2' }]];
        if (q.includes('SELECT COUNT(*) AS n FROM task_submissions s')) return [[{ n: '5' }]];
        if (q.includes('FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id AND c.teacher_id = ?')) return [[{ id: 9, full_name: 'Ali', course_id: 1, course: 'Py', progress: '50', enrolled_at: 'e', last_submission: null, avg_grade: '90.00' }]];
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(reset);

test('login is required', async () => {
    expect((await request(app).get('/api/summary/counts')).status).toBe(401);
});

test('student counts: tasks to do, groups, answered orders', async () => {
    const r = await request(app).get('/api/summary/counts').set(as(5, 'student'));
    expect(r.body).toEqual({ role: 'student', groups: 3, tasksTodo: 3, ordersAnswered: 2 });
});

test('student summary: task buckets, rounded average, completed course flag', async () => {
    const r = await request(app).get('/api/summary/student').set(as(5, 'student'));
    expect(r.body.tasks).toEqual({ todo: 3, overdue: 1, dueSoon: 1, submitted: 1, graded: 1 });
    expect(r.body).toMatchObject({ activeCourses: 2, completedCourses: 1, groups: 3, avgGrade: 87.5 });
    expect(r.body.courses.map((c) => [c.progress, c.completed])).toEqual([[100, true], [40.5, false]]);
    expect(r.body.recentGrades[0]).toMatchObject({ task: 'T', grade: 95 });
});

test('a brand-new student gets zeros and null, never sample numbers', async () => {
    data.tasks = []; data.empty = true;
    const r = await request(app).get('/api/summary/student').set(as(5, 'student'));
    expect(r.body.tasks).toEqual({ todo: 0, overdue: 0, dueSoon: 0, submitted: 0, graded: 0 });
    expect(r.body.avgGrade).toBeNull();
    expect(r.body.courses).toEqual([]);
});

test('teacher summary: numbers, 7-day activity merges submissions and enrolments, recent is newest first', async () => {
    const r = await request(app).get('/api/summary/teacher').set(as(2, 'teacher'));
    expect(r.body).toMatchObject({ activeCourses: 3, draftCourses: 1, students: 7, tasksGiven: 4, toGrade: 5, gradedCount: 6, avgGrade: 80.3, ordersPending: 2 });
    expect(r.body.week).toHaveLength(7);
    expect(r.body.week[6]).toEqual({ day: day(0), count: 3 });
    expect(r.body.week[4]).toEqual({ day: day(-2), count: 4 });
    expect(r.body.recent.map((x) => x.type)).toEqual(['enrolled', 'submission']);
    expect(r.body.courses[0]).toMatchObject({ students: 7, tasks: 2, submitted: 9, avgGrade: null });
});

test('teacher with no grades has null average', async () => {
    data.empty = true;
    expect((await request(app).get('/api/summary/teacher').set(as(2, 'teacher'))).body.avgGrade).toBeNull();
});

test('teacher students list; roles are enforced', async () => {
    const r = await request(app).get('/api/summary/teacher/students').set(as(2, 'teacher'));
    expect(r.body.students[0]).toEqual({ id: 9, name: 'Ali', courseId: 1, course: 'Py', progress: 50, lastActive: 'e', avgGrade: 90 });
    expect((await request(app).get('/api/summary/teacher').set(as(5, 'student'))).status).toBe(403);
    expect((await request(app).get('/api/summary/teacher/students').set(as(5, 'student'))).status).toBe(403);
    expect((await request(app).get('/api/summary/student').set(as(2, 'teacher'))).status).toBe(403);
});
