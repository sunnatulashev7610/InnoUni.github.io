// Submission + grading flow. Runs without MySQL: an in-memory fake answers the exact queries the routes send.
// (It checks the route logic and the order of SQL parameters, not MySQL syntax.)
process.env.JWT_SECRET = 'test-secret-test-secret-123';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

const TEACHER = 2;        // owns course 10
const OTHER_TEACHER = 3;  // owns course 11
const STUDENT = 5;        // task 1 is assigned to this student
const OTHER_STUDENT = 6;

let state;
const reset = () => {
    state = {
        courses: [{ id: 10, teacher_id: TEACHER }, { id: 11, teacher_id: OTHER_TEACHER }],
        tasks: [
            { id: 1, title: 'Essay', course_id: 10, assigned_to: STUDENT, status: 'pending' },
            { id: 2, title: 'Unassigned', course_id: 10, assigned_to: null, status: 'pending' },
            { id: 3, title: 'Other course', course_id: 11, assigned_to: STUDENT, status: 'pending' }
        ],
        users: { [STUDENT]: { full_name: 'Ali', email: 'ali@example.com' } },
        submissions: [],
        nextId: 1
    };
};

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

const fakeDb = {
    async execute(rawSql, p = []) {
        const sql = norm(rawSql);

        if (sql.startsWith('SELECT t.id, t.title, t.assigned_to FROM tasks t JOIN courses c')) {
            const [taskId, teacherId] = p;
            const t = state.tasks.find((x) => x.id === taskId);
            const c = t && state.courses.find((x) => x.id === t.course_id);
            return [t && c.teacher_id === teacherId ? [{ id: t.id, title: t.title, assigned_to: t.assigned_to }] : []];
        }
        if (sql.startsWith('SELECT t.id, t.assigned_to FROM tasks t LEFT JOIN course_enrollments ce')) {
            const [userId, taskId] = p;
            const enrolled = (state.enrolled || []).some((e) => e.u === userId);
            return [state.tasks.filter((t) => t.id === taskId && (t.assigned_to === userId || (t.assigned_to === null && enrolled)))
                .map((t) => ({ id: t.id, assigned_to: t.assigned_to }))];
        }
        if (sql.startsWith('SELECT id, status FROM task_submissions WHERE task_id = ? AND student_id = ?')) {
            return [state.submissions.filter((s) => s.task_id === p[0] && s.student_id === p[1])
                .map((s) => ({ id: s.id, status: s.status }))];
        }
        if (sql.startsWith('SELECT id FROM task_submissions WHERE task_id = ? AND student_id = ?')) {
            return [state.submissions.filter((s) => s.task_id === p[0] && s.student_id === p[1]).map((s) => ({ id: s.id }))];
        }
        if (sql.startsWith('INSERT INTO task_submissions (task_id, student_id, content)')) {
            const [task_id, student_id, content] = p;
            state.submissions.push({ id: state.nextId++, task_id, student_id, content, status: 'submitted',
                                     grade: null, feedback: null, graded_by: null });
            return [{ insertId: state.nextId - 1 }];
        }
        if (sql.startsWith('UPDATE task_submissions SET content = ?, submitted_at = NOW() WHERE id = ?')) {
            state.submissions.find((s) => s.id === p[1]).content = p[0];
            return [{}];
        }
        if (sql.startsWith('UPDATE task_submissions SET grade = ?, feedback = ?, status = \'graded\'')) {
            const [grade, feedback, graded_by, id] = p;
            Object.assign(state.submissions.find((s) => s.id === id), { grade, feedback, graded_by, status: 'graded' });
            return [{}];
        }
        if (sql.startsWith('UPDATE tasks SET status = "completed" WHERE id = ?')) {
            state.tasks.find((t) => t.id === p[0]).status = 'completed';
            return [{}];
        }
        if (sql.includes('FROM task_submissions s JOIN users u ON s.student_id = u.id WHERE s.task_id = ?')) {
            return [state.submissions.filter((s) => s.task_id === p[0]).map((s) => ({
                ...s, student_name: state.users[s.student_id]?.full_name, student_email: state.users[s.student_id]?.email }))];
        }
        if (sql.includes('FROM task_submissions s WHERE s.task_id = ? AND s.student_id = ?')) {
            return [state.submissions.filter((s) => s.task_id === p[0] && s.student_id === p[1])];
        }
        throw new Error('Unexpected query in test: ' + sql);
    },
    query: async () => [[]]
};

const as = (userId, role) => ({
    Authorization: `Bearer ${jwt.sign({ userId, email: `u${userId}@example.com`, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
});

const submit = (taskId, content, user = [STUDENT, 'student']) =>
    request(app).post(`/api/student/tasks/${taskId}/submit`).set(as(...user)).send({ content });
const grade = (taskId, body, user = [TEACHER, 'teacher']) =>
    request(app).post(`/api/teacher/tasks/${taskId}/grade`).set(as(...user)).send(body);

beforeAll(() => app.setDb(fakeDb));
beforeEach(reset);

describe('student submission', () => {
    test('submits an answer and the task becomes completed', async () => {
        const res = await submit(1, '  My essay  ');
        expect(res.status).toBe(201);
        expect(state.submissions).toHaveLength(1);
        expect(state.submissions[0]).toMatchObject({ task_id: 1, student_id: STUDENT, content: 'My essay' });
        expect(state.tasks[0].status).toBe('completed');
    });

    test('can re-submit before grading: content is replaced, not duplicated', async () => {
        await submit(1, 'first');
        const res = await submit(1, 'second');
        expect(res.status).toBe(200);
        expect(state.submissions).toHaveLength(1);
        expect(state.submissions[0].content).toBe('second');
    });

    test('cannot submit a task assigned to someone else', async () => {
        const res = await submit(1, 'hi', [OTHER_STUDENT, 'student']);
        expect(res.status).toBe(404);
        expect(state.submissions).toHaveLength(0);
    });

    test.each([[undefined], [''], ['   '], [123], [{ a: 1 }], ['x'.repeat(10001)]])(
        'rejects an invalid answer: %p', async (content) => {
            const res = await submit(1, content);
            expect(res.status).toBe(400);
            expect(state.submissions).toHaveLength(0);
        });

    test.each([['abc'], ['0'], ['-1'], ['1.5']])('rejects task id %p', async (id) => {
        const res = await submit(id, 'x');
        expect(res.status).toBe(400);
    });

    test('teachers cannot use the student endpoint, anonymous users get 401', async () => {
        expect((await submit(1, 'x', [TEACHER, 'teacher'])).status).toBe(403);
        const anon = await request(app).post('/api/student/tasks/1/submit').send({ content: 'x' });
        expect(anon.status).toBe(401);
    });
});

describe('teacher grading', () => {
    test('cannot grade before the student submitted', async () => {
        const res = await grade(1, { grade: 90 });
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not submitted/i);
    });

    test('grades a submission and stores grade, feedback and who graded', async () => {
        await submit(1, 'essay');
        const res = await grade(1, { grade: 85.5, feedback: ' Good work ' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ taskId: 1, studentId: STUDENT, grade: 85.5, feedback: 'Good work' });
        expect(state.submissions[0]).toMatchObject({ status: 'graded', grade: 85.5, feedback: 'Good work', graded_by: TEACHER });
    });

    test('feedback is optional', async () => {
        await submit(1, 'essay');
        const res = await grade(1, { grade: 70 });
        expect(res.status).toBe(200);
        expect(state.submissions[0].feedback).toBeNull();
    });

    test.each([[undefined], [null], ['90'], ['A'], [-1], [100.01], [101], [true], [[90]]])(
        'rejects grade %p', async (g) => {
            await submit(1, 'essay');
            const res = await grade(1, { grade: g });
            expect(res.status).toBe(400);
            expect(state.submissions[0].status).toBe('submitted');
        });

    test('boundary grades 0 and 100 are accepted', async () => {
        await submit(1, 'essay');
        expect((await grade(1, { grade: 0 })).status).toBe(200);
        expect((await grade(1, { grade: 100 })).status).toBe(200);
    });

    test('rejects feedback that is not text or is too long', async () => {
        await submit(1, 'essay');
        expect((await grade(1, { grade: 80, feedback: { x: 1 } })).status).toBe(400);
        expect((await grade(1, { grade: 80, feedback: 'x'.repeat(2001) })).status).toBe(400);
    });

    test('a teacher cannot grade another teacher\'s task', async () => {
        await submit(3, 'essay');
        const res = await grade(3, { grade: 100 });
        expect(res.status).toBe(403);
        expect(state.submissions[0].status).toBe('submitted');
    });

    test('a student cannot grade', async () => {
        await submit(1, 'essay');
        const res = await grade(1, { grade: 100 }, [STUDENT, 'student']);
        expect(res.status).toBe(403);
        expect(state.submissions[0].status).toBe('submitted');
    });

    test('a course task needs student_id to be graded, and then works', async () => {
        state.enrolled = [{ u: STUDENT }];
        await submit(2, 'my answer');
        expect((await grade(2, { grade: 80 })).status).toBe(400);
        expect((await grade(2, { grade: 80, student_id: 'x' })).status).toBe(400);
        expect((await grade(2, { grade: 80, student_id: OTHER_STUDENT })).status).toBe(404); // has not submitted
        expect((await grade(2, { grade: 80, student_id: STUDENT })).status).toBe(200);
        expect(state.submissions[0]).toMatchObject({ status: 'graded', grade: 80 });
    });

    test('a course task: only enrolled students can submit; its shared status is untouched', async () => {
        expect((await submit(2, 'x')).status).toBe(404);                 // not enrolled
        state.enrolled = [{ u: STUDENT }];
        expect((await submit(2, 'x')).status).toBe(201);
        expect(state.tasks.find((t) => t.id === 2).status).toBe('pending');
    });

    test('student_id must match the assignment', async () => {
        await submit(1, 'essay');
        expect((await grade(1, { grade: 80, student_id: OTHER_STUDENT })).status).toBe(400);
        expect((await grade(1, { grade: 80, student_id: STUDENT })).status).toBe(200);
    });

    test('invalid task id is a 400, not a server error', async () => {
        expect((await grade('abc', { grade: 80 })).status).toBe(400);
    });
});

describe('after grading', () => {
    test('the student can no longer change a graded submission', async () => {
        await submit(1, 'essay');
        await grade(1, { grade: 90 });
        const res = await submit(1, 'sneaky rewrite');
        expect(res.status).toBe(409);
        expect(state.submissions[0].content).toBe('essay');
    });

    test('the student sees own grade and feedback', async () => {
        await submit(1, 'essay');
        await grade(1, { grade: 88, feedback: 'Nice' });
        const res = await request(app).get('/api/student/tasks/1/submission').set(as(STUDENT, 'student'));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ grade: 88, feedback: 'Nice', status: 'graded' });
    });

    test('another student cannot read the submission', async () => {
        await submit(1, 'essay');
        const res = await request(app).get('/api/student/tasks/1/submission').set(as(OTHER_STUDENT, 'student'));
        expect(res.status).toBe(404);
    });
});

describe('teacher submission list', () => {
    test('owner sees submissions with student name', async () => {
        await submit(1, 'essay');
        const res = await request(app).get('/api/teacher/tasks/1/submissions').set(as(TEACHER, 'teacher'));
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({ student_name: 'Ali', content: 'essay' });
    });

    test('another teacher and students are refused', async () => {
        await submit(1, 'essay');
        const other = await request(app).get('/api/teacher/tasks/1/submissions').set(as(OTHER_TEACHER, 'teacher'));
        expect(other.status).toBe(403);
        const student = await request(app).get('/api/teacher/tasks/1/submissions').set(as(STUDENT, 'student'));
        expect(student.status).toBe(403);
    });
});
