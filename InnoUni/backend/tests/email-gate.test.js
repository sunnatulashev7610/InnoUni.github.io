process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { register, setVerified, withAccounts } = require('./helpers/accounts');

const as = (id, role) => ({ Authorization: `Bearer ${jwt.sign({ userId: id, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const MAIL = ['BREVO_API_KEY', 'MAIL_FROM', 'EMAIL_USER', 'EMAIL_PASS', 'REQUIRE_EMAIL_VERIFICATION'];
let saved;
beforeEach(() => {
    saved = Object.fromEntries(MAIL.map((k) => [k, process.env[k]]));
    MAIL.forEach((k) => delete process.env[k]);
    register(1, 'student'); register(2, 'admin'); register(3, 'teacher');
    [1, 2, 3].forEach((id) => setVerified(id, true));
    app.setDb(withAccounts({ execute: async () => [[]], query: async () => [[]] }));
});
afterEach(() => { MAIL.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))); });

const write = (id, role) => request(app).post('/api/student/courses/5/enroll').set(as(id, role));
const blocked = (r) => r.status === 403 && r.body.code === 'EMAIL_NOT_VERIFIED';

describe('unconfirmed e-mail holds every change', () => {
    test('with the mail service set up it is required by default', async () => {
        process.env.BREVO_API_KEY = 'k'; process.env.MAIL_FROM = 'a@b.uz';
        setVerified(1, false);
        expect(blocked(await write(1, 'student'))).toBe(true);
    });
    test('without a mail service nobody could confirm, so nothing is held', async () => {
        setVerified(1, false);
        expect(blocked(await write(1, 'student'))).toBe(false);
    });
    test('REQUIRE_EMAIL_VERIFICATION=true holds even without mail; =false never holds', async () => {
        setVerified(1, false);
        process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
        expect(blocked(await write(1, 'student'))).toBe(true);
        process.env.REQUIRE_EMAIL_VERIFICATION = 'false'; process.env.BREVO_API_KEY = 'k'; process.env.MAIL_FROM = 'a@b.uz';
        expect(blocked(await write(1, 'student'))).toBe(false);
    });
    test('reading stays open', async () => {
        process.env.REQUIRE_EMAIL_VERIFICATION = 'true'; setVerified(1, false);
        const r = await request(app).get('/api/student/courses').set(as(1, 'student'));
        expect(blocked(r)).toBe(false);
    });
    test('a confirmed person and an admin are not held', async () => {
        process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
        expect(blocked(await write(1, 'student'))).toBe(false);
        setVerified(2, false);
        expect(blocked(await request(app).post('/api/admin/users/9/block').set(as(2, 'admin')))).toBe(false);
    });
    test('account routes and notifications stay open so the person can confirm', async () => {
        process.env.REQUIRE_EMAIL_VERIFICATION = 'true'; setVerified(1, false);
        const r1 = await request(app).post('/api/auth/resend-verification').set(as(1, 'student'));
        const r2 = await request(app).put('/api/notifications/read').set(as(1, 'student')).send({});
        expect(blocked(r1)).toBe(false);
        expect(blocked(r2)).toBe(false);
    });
    test('writes in other areas are held too (Q&A, teacher courses)', async () => {
        process.env.REQUIRE_EMAIL_VERIFICATION = 'true'; setVerified(1, false); setVerified(3, false);
        expect(blocked(await request(app).post('/api/lesson-qa/items/1').set(as(1, 'student')).send({ body: 'x' }))).toBe(true);
        expect(blocked(await request(app).post('/api/teacher/courses').set(as(3, 'teacher')).send({ title: 't' }))).toBe(true);
    });
});
