process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const { register, setBlocked, withAccounts } = require('./helpers/accounts');
const { invalidateUserCache } = require('../middleware/roleBased');

const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role) => (register(userId, role), { Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
let s;
const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT id FROM course_enrollments WHERE course_id = ? AND user_id = ?')) return [[{ id: 1 }]];
        if (q.startsWith('SELECT id FROM users WHERE LOWER(email) = ?')) return [s.users.filter((u) => u.email.toLowerCase() === p[0]).map((u) => ({ id: u.id }))];
        if (q.startsWith('INSERT INTO users')) { s.inserted = p; return [{ insertId: 9 }]; }
        if (q.startsWith('SELECT id, full_name, email, phone, role')) return [[{ id: 9, role: 'student' }]];
        if (q.startsWith('SELECT * FROM users WHERE LOWER(email) = ?')) return [s.users.filter((u) => u.email.toLowerCase() === p[0])];
        if (q.startsWith('SELECT t.id, t.assigned_to, t.course_id FROM tasks t')) return [[{ id: 4, assigned_to: null, course_id: 10 }]];
        if (q.startsWith('SELECT id, status FROM task_submissions')) return [[]];
        if (q.startsWith('INSERT INTO task_submissions')) { s.subs++; return [{ insertId: 1 }]; }
        if (q.includes('AS total') && q.includes('AS done')) return [[{ total: '4', done: String(s.subs) }]];
        if (q.startsWith('UPDATE course_enrollments SET progress')) { s.progress = p; return [{ affectedRows: 1 }]; }
        if (q.startsWith('SELECT COUNT(*) as count')) return [[{ count: 0 }]];
        if (q.startsWith('SELECT id FROM task_submissions WHERE task_id = ? AND student_id = ?')) return [s.subs ? [{ id: 1 }] : []];
        if (q.startsWith('SELECT id FROM tasks WHERE id = ? AND assigned_to = ?')) return [[{ id: 4 }]];
        if (q.startsWith('UPDATE tasks SET status')) { s.completed = true; return [{ affectedRows: 1 }]; }
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(withAccounts(fakeDb)));
beforeEach(async () => { s = { users: [], subs: 0, progress: null, completed: false, inserted: null }; });

describe('progress cannot be set by the student', () => {
    test('PUT progress is refused', async () => {
        const r = await request(app).put('/api/student/courses/10/progress').set(as(5, 'student')).send({ progress: 100 });
        expect(r.status).toBe(403);
        expect(s.progress).toBeNull();
    });
    test('submitting a task recalculates progress from real work', async () => {
        s.subs = 0;
        const r = await request(app).post('/api/student/tasks/4/submit').set(as(5, 'student')).send({ content: 'answer' });
        expect(r.status).toBe(201);
        expect(s.progress).toEqual([25, 'active', 10, 5]); // 1 of 4 tasks
    });
    test('"complete" needs a real submission', async () => {
        expect((await request(app).put('/api/student/tasks/4/complete').set(as(5, 'student'))).status).toBe(409);
        expect(s.completed).toBe(false);
        s.subs = 1;
        expect((await request(app).put('/api/student/tasks/4/complete').set(as(5, 'student'))).status).toBe(200);
    });
});

describe('account state is checked on every request', () => {
    test('a blocked account is cut off at once, an unblocked one works again', async () => {
        expect((await request(app).get('/api/summary/counts').set(as(6, 'student'))).status).not.toBe(403);
        setBlocked(6, true);
        expect((await request(app).get('/api/summary/counts').set(as(6, 'student'))).status).toBe(403);
        setBlocked(6, false);
    });
    test('a deleted account gets 401', async () => {
        invalidateUserCache(999);
        const unknown = { Authorization: `Bearer ${jwt.sign({ userId: 999, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` };
        expect((await request(app).get('/api/admin/stats').set(unknown)).status).toBe(401);
    });
    test('the role in the database wins over the role in the token', async () => {
        register(8, 'student'); // demoted
        const stale = { Authorization: `Bearer ${jwt.sign({ userId: 8, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` };
        expect((await request(app).get('/api/admin/stats').set(stale)).status).toBe(403);
    });
});

describe('emails are case-insensitive', () => {
    test('registration stores a lowercase email and refuses a case variant', async () => {
        const r1 = await request(app).post('/api/auth/register').send({ full_name: ' Ali   Valiyev ', email: ' Ali@X.uz ', password: 'Password123!' });
        expect(r1.status).toBe(201);
        expect(s.inserted.slice(0, 3)).toEqual(['Ali Valiyev', 'ali@x.uz', null]); // trimmed, lowercase, no phone => null
        s.users = [{ id: 1, email: 'ali@x.uz' }];
        const r2 = await request(app).post('/api/auth/register').send({ full_name: 'Ali', email: 'ALI@x.uz', password: 'Password123!' });
        expect(r2.status).toBe(400);
    });
    test('login works with any letter case', async () => {
        s.users = [{ id: 1, email: 'ali@x.uz', password: await bcrypt.hash('Password123!', 4), role: 'student', full_name: 'Ali' }];
        const r = await request(app).post('/api/auth/login').send({ email: 'ALI@X.UZ ', password: 'Password123!' });
        expect(r.status).toBe(200);
    });
    test('name and phone are validated', async () => {
        const base = { email: 'a@b.uz', password: 'Password123!' };
        expect((await request(app).post('/api/auth/register').send({ ...base, full_name: 'A' })).status).toBe(400);
        expect((await request(app).post('/api/auth/register').send({ ...base, full_name: 'x'.repeat(101) })).status).toBe(400);
        expect((await request(app).post('/api/auth/register').send({ ...base, full_name: 'Ali', phone: 'abc' })).status).toBe(400);
        expect((await request(app).post('/api/auth/register').send({ ...base, full_name: 'Ali', phone: '+998 90 123 45 67' })).status).toBe(201);
    });
});
