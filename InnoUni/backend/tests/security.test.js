// Security regression tests. They run without MySQL: a fake database is injected into the app.
process.env.JWT_SECRET = 'test-secret-test-secret-123';
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASS;

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

const fakeDb = {
    execute: async () => [[]],
    query: async () => [[]]
};

const tokenFor = (userId, role) =>
    jwt.sign({ userId, email: `u${userId}@example.com`, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

const auth = (userId, role) => ({ Authorization: `Bearer ${tokenFor(userId, role)}` });

beforeAll(() => app.setDb(fakeDb));

describe('configuration', () => {
    test('refuses to start without a JWT_SECRET', () => {
        const saved = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;
        jest.isolateModules(() => {
            expect(() => require('../config')).toThrow(/JWT_SECRET/);
        });
        process.env.JWT_SECRET = saved;
    });

    test('rejects tokens signed with a different secret', async () => {
        const forged = jwt.sign({ userId: 1, role: 'admin' }, 'your-secret-key');
        const res = await request(app)
            .get('/api/dashboard/stats/1')
            .set('Authorization', `Bearer ${forged}`);
        expect(res.status).toBe(403);
    });
});

describe('registration', () => {
    const body = { full_name: 'Test User', email: 'test@example.com', password: 'longenough1' };

    test('cannot self-register as admin', async () => {
        const res = await request(app).post('/api/auth/register').send({ ...body, role: 'admin' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/role/i);
    });

    test('rejects short passwords', async () => {
        const res = await request(app).post('/api/auth/register').send({ ...body, password: 'short' });
        expect(res.status).toBe(400);
    });

    test('rejects a non-string password instead of crashing', async () => {
        const res = await request(app).post('/api/auth/register').send({ ...body, password: 12345678 });
        expect(res.status).toBe(400);
    });

    test('rejects an invalid email', async () => {
        const res = await request(app).post('/api/auth/register').send({ ...body, email: 'not-an-email' });
        expect(res.status).toBe(400);
    });

    test('student and teacher roles are accepted by validation', async () => {
        for (const role of ['student', 'teacher']) {
            const res = await request(app).post('/api/auth/register').send({ ...body, role });
            expect(res.status).not.toBe(400);
        }
    });
});

describe('password change', () => {
    test('applies the same password rules as registration', async () => {
        const res = await request(app)
            .put('/api/auth/password')
            .set(auth(1, 'student'))
            .send({ current_password: 'whatever', new_password: 'abc' });
        expect(res.status).toBe(400);
    });
});

describe('authorization (IDOR)', () => {
    test('dashboard API requires a token', async () => {
        for (const url of ['stats', 'activity', 'progress', 'recommendations']) {
            const res = await request(app).get(`/api/dashboard/${url}/1`);
            expect(res.status).toBe(401);
        }
    });

    test('dashboard API: a user cannot read another user', async () => {
        for (const url of ['stats', 'activity', 'progress', 'recommendations']) {
            const res = await request(app).get(`/api/dashboard/${url}/2`).set(auth(1, 'student'));
            expect(res.status).toBe(403);
        }
    });

    test('dashboard API: a user can reach their own data', async () => {
        const res = await request(app).get('/api/dashboard/stats/1').set(auth(1, 'student'));
        expect([401, 403]).not.toContain(res.status);
    });

    test('student dashboard: other student is forbidden, own id is allowed', async () => {
        const other = await request(app).get('/api/student/dashboard/2').set(auth(1, 'student'));
        expect(other.status).toBe(403);
        const own = await request(app).get('/api/student/dashboard/1').set(auth(1, 'student'));
        expect([401, 403]).not.toContain(own.status);
    });

    test('teacher routes: other teacher is forbidden, own id is allowed', async () => {
        for (const route of ['dashboard', 'courses', 'tasks', 'library', 'analytics']) {
            const other = await request(app).get(`/api/teacher/${route}/2`).set(auth(1, 'teacher'));
            expect(other.status).toBe(403);
            const own = await request(app).get(`/api/teacher/${route}/1`).set(auth(1, 'teacher'));
            expect([401, 403]).not.toContain(own.status);
        }
    });

    test('a student cannot use teacher routes', async () => {
        const res = await request(app).get('/api/teacher/dashboard/1').set(auth(1, 'student'));
        expect(res.status).toBe(403);
    });

    test('/dashboard/:userId compares ids as numbers', async () => {
        const own = await request(app).get('/dashboard/1').set(auth(1, 'student'));
        expect(own.status).toBe(302);
        expect(own.headers.location).toBe('/secondary-pages/dashboard/dashboard.html');
        const other = await request(app).get('/dashboard/2').set(auth(1, 'student'));
        expect(other.status).toBe(403);
    });
});

describe('contact form', () => {
    const valid = { name: 'Ali', email: 'ali@example.com', message: 'Salom' };

    test('rejects an invalid email', async () => {
        const res = await request(app).post('/api/contact').send({ ...valid, email: 'bad' });
        expect(res.status).toBe(400);
    });

    test('rejects non-string fields', async () => {
        const res = await request(app).post('/api/contact').send({ ...valid, name: { $ne: '' } });
        expect(res.status).toBe(400);
    });

    test('answers 503 when email is not configured instead of using hardcoded credentials', async () => {
        const res = await request(app).post('/api/contact').send(valid);
        expect(res.status).toBe(503);
    });
});

describe('escapeHtml', () => {
    const { escapeHtml } = require('../utils/escapeHtml');

    test('escapes HTML special characters', () => {
        expect(escapeHtml('<img src=x onerror="alert(1)">&\'')).toBe(
            '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;'
        );
    });

    test('handles null and undefined', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });
});
