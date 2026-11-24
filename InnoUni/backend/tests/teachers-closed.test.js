// The app is for students first: teacher accounts and the teacher cabinet are closed until FEATURE_TEACHERS=true
process.env.JWT_SECRET = 'test-secret-test-secret-123';
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const { register, withAccounts } = require('./helpers/accounts');

const as = (userId, role) => (register(userId, role), { Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const page = (f) => fs.readFileSync(path.join(__dirname, '../../secondary-pages', f), 'utf8');
let users;
beforeAll(() => {
    const hash = bcrypt.hashSync('Parol123!x', 4);
    users = [{ id: 7, email: 'ustoz@example.com', password: hash, role: 'teacher', blocked: 0, full_name: 'Ustoz', token_version: 0, email_verified: 1 },
        { id: 8, email: 'oquvchi@example.com', password: hash, role: 'student', blocked: 0, full_name: 'Oquvchi', token_version: 0, email_verified: 1 }];
    app.setDb(withAccounts({
        execute: async (sql, p) => {
            if (/FROM users WHERE LOWER\(email\) = \?/.test(sql)) return [users.filter((u) => u.email === p[0])];
            return [[]];
        }, query: async () => [[]]
    }));
});
beforeEach(() => { process.env.FEATURE_TEACHERS = 'false'; });
afterAll(() => { process.env.FEATURE_TEACHERS = 'true'; });

describe('server', () => {
    test('nobody can register as a teacher; the answer has a code the page understands', async () => {
        const r = await request(app).post('/api/auth/register').send({ full_name: 'Ustoz Bek', email: 'yangi@example.com', password: 'Parol123!x', role: 'teacher' });
        expect(r.status).toBe(403); expect(r.body.code).toBe('TEACHERS_CLOSED');
    });
    test('students can still register (the role check does not break them)', async () => {
        const r = await request(app).post('/api/auth/register').send({ full_name: 'Oquvchi Bek', email: 'yangi2@example.com', password: 'Parol123!x', role: 'student' });
        expect(r.body.code).not.toBe('TEACHERS_CLOSED');
    });
    test('an existing teacher cannot sign in, whichever role is chosen on the page; a student can', async () => {
        for (const role of ['teacher', 'student', undefined]) {
            const r = await request(app).post('/api/auth/login').send({ email: 'ustoz@example.com', password: 'Parol123!x', role });
            expect([r.status, r.body.code]).toEqual([403, 'TEACHERS_CLOSED']);
        }
        const ok = await request(app).post('/api/auth/login').send({ email: 'oquvchi@example.com', password: 'Parol123!x', role: 'student' });
        expect(ok.status).toBe(200);
    });
    test('a teacher who is already signed in is stopped on every teacher route; students and admins are not', async () => {
        for (const url of ['/api/teacher/courses', '/api/groups', '/api/course-tools/overview']) {
            const r = await request(app).get(url).set(as(7, 'teacher'));
            expect([url, r.status, r.body.code]).toEqual([url, 403, 'TEACHERS_CLOSED']);
        }
        expect((await request(app).get('/api/teams').set(as(8, 'student'))).status).not.toBe(403);
        expect((await request(app).get('/api/admin/tournaments').set(as(9, 'admin'))).status).not.toBe(403);
    });
    test('with FEATURE_TEACHERS=true the teacher works again', async () => {
        process.env.FEATURE_TEACHERS = 'true';
        const r = await request(app).post('/api/auth/login').send({ email: 'ustoz@example.com', password: 'Parol123!x', role: 'teacher' });
        expect(r.status).toBe(200);
        expect((await request(app).get('/api/teams').set(as(7, 'teacher'))).status).not.toBe(403);
    });
});

describe('pages', () => {
    test('login and register show the teacher card as "Tez orada" and cannot select it', () => {
        for (const f of ['login/login.html', 'login/register.html']) {
            const h = page(f);
            expect(h).toMatch(/class="role-option soon" data-role="teacher" data-soon="1"/);
            expect(h).toContain('Tez orada');
            expect(h).toContain("if (this.dataset.soon) return;");
            expect(h).toContain("const roles = ['student'];");
            expect(h).toContain('TEACHERS_CLOSED');
        }
        expect(page('login/login.html')).toContain('teachers=soon');
    });
    test('the dashboard hides the role switch, always shows the student side, and sends a teacher session to the login page', () => {
        const h = page('dashboard/dashboard.html');
        expect(h).toContain('var TEACHERS_OPEN = false;');
        expect(h).toMatch(/session\.role === 'teacher' && !TEACHERS_OPEN/);
        expect(h).toContain("../login/login.html?teachers=soon");
        expect(h).toMatch(/\.role-switch'\)\.forEach\(function \(n\) \{ n\.hidden = !TEACHERS_OPEN; \}\)/);
        expect(h).toMatch(/function initialRole\(\) \{\s*if \(!TEACHERS_OPEN\) return 'student';/);
    });
});
