process.env.JWT_SECRET = 'test-secret-test-secret-123';
delete process.env.EMAIL_USER; delete process.env.EMAIL_PASS;
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const { register, withAccounts } = require('./helpers/accounts');
const { hash } = require('../utils/authTokens');

const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role) => (register(userId, role), { Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
let s, mails;
const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT id FROM users WHERE LOWER(email) = ?')) return [s.users.filter((u) => u.email === p[0]).map((u) => ({ id: u.id }))];
        if (q.startsWith('INSERT INTO users')) { s.users.push({ id: 9, email: p[1], verified: 0 }); return [{ insertId: 9 }]; }
        if (q.startsWith('SELECT id, full_name, email, phone, role')) return [[{ id: 9, role: 'student' }]];
        if (q.startsWith('INSERT INTO auth_tokens')) { s.tokens.push({ id: s.tokens.length + 1, user_id: p[0], kind: p[1], hash: p[2], used: false, at: Date.now() }); return [{ insertId: 1 }]; }
        if (q.startsWith('SELECT id, user_id FROM auth_tokens')) return [s.tokens.filter((t) => t.hash === p[0] && t.kind === p[1] && !t.used && !t.expired).map((t) => ({ id: t.id, user_id: t.user_id }))];
        if (q.startsWith('UPDATE auth_tokens SET used_at = NOW() WHERE id = ?')) { const t = s.tokens.find((x) => x.id === p[0] && !x.used); if (t) t.used = true; return [{ affectedRows: t ? 1 : 0 }]; }
        if (q.startsWith("UPDATE auth_tokens SET used_at = NOW() WHERE user_id")) { s.tokens.filter((t) => t.user_id === p[0] && t.kind === 'reset').forEach((t) => (t.used = true)); return [{ affectedRows: 1 }]; }
        if (q.startsWith('SELECT id FROM auth_tokens WHERE user_id = ? AND kind = ?')) return [s.tokens.filter((t) => t.user_id === p[0] && t.kind === p[1] && Date.now() - t.at < p[2] * 1000).map((t) => ({ id: t.id }))];
        if (q.startsWith('UPDATE users SET email_verified = 1 WHERE id = ?')) { s.users.find((u) => u.id === p[0]).verified = 1; return [{ affectedRows: 1 }]; }
        if (q.startsWith('SELECT email, email_verified FROM users WHERE id = ?')) { const u = s.users.find((x) => x.id === p[0]); return [u ? [{ email: u.email, email_verified: u.verified }] : []]; }
        if (q.startsWith('SELECT id, email, blocked FROM users WHERE LOWER(email) = ?')) return [s.users.filter((u) => u.email === p[0]).map((u) => ({ id: u.id, email: u.email, blocked: 0 }))];
        if (q.startsWith('UPDATE users SET password = ?, email_verified = 1')) { s.users.find((u) => u.id === p[1]).password = p[0]; s.users.find((u) => u.id === p[1]).verified = 1; return [{ affectedRows: 1 }]; }
        if (q.startsWith('SELECT email_verified FROM users WHERE id = ?')) { const u = s.users.find((x) => x.id === p[0]); return [[{ email_verified: u ? u.verified : 0 }]]; }
        if (q.startsWith("INSERT INTO courses")) return [{ insertId: 77 }];
        if (q.includes('courses') && q.startsWith('SELECT')) return [[]];
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
const tokenFromMail = () => mails[mails.length - 1].text.match(/token=([a-f0-9]{64})/)[1];
const wait = () => new Promise((r) => setTimeout(r, 20));

beforeAll(() => app.setDb(withAccounts(fakeDb)));
beforeEach(() => {
    s = { users: [{ id: 1, email: 'ali@x.uz', verified: 0 }], tokens: [] };
    mails = [];
    process.env.BREVO_API_KEY = 'key'; process.env.MAIL_FROM = 'noreply@x.uz';
    global.fetch = jest.fn(async (url, opts) => { mails.push({ url, text: JSON.parse(opts.body).textContent, to: JSON.parse(opts.body).to[0].email }); return { ok: true, json: async () => ({}) }; });
});
afterAll(() => { delete process.env.BREVO_API_KEY; delete process.env.MAIL_FROM; delete process.env.REQUIRE_EMAIL_VERIFICATION; });

test('registration sends a verification mail and only the hash is stored', async () => {
    const r = await request(app).post('/api/auth/register').send({ full_name: 'Vali Karimov', email: 'Vali@X.uz', password: 'Password123!' });
    expect(r.status).toBe(201);
    await wait();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('vali@x.uz');
    const raw = tokenFromMail();
    expect(s.tokens[0].hash).toBe(hash(raw));
    expect(s.tokens[0].hash).not.toBe(raw);
});

test('registration still works when no mail service is set up', async () => {
    delete process.env.BREVO_API_KEY;
    expect((await request(app).post('/api/auth/register').send({ full_name: 'Vali Karimov', email: 'v@x.uz', password: 'Password123!' })).status).toBe(201);
    expect(mails).toHaveLength(0);
});

test('a mail failure does not break registration', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect((await request(app).post('/api/auth/register').send({ full_name: 'Vali Karimov', email: 'w@x.uz', password: 'Password123!' })).status).toBe(201);
});

describe('verify email', () => {
    test('the link works once', async () => {
        await request(app).post('/api/auth/register').send({ full_name: 'Vali Karimov', email: 'v2@x.uz', password: 'Password123!' });
        await wait();
        const token = tokenFromMail();
        expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(200);
        expect(s.users.find((u) => u.id === 9).verified).toBe(1);
        expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(400);
    });
    test('wrong, missing or expired tokens are refused', async () => {
        expect((await request(app).post('/api/auth/verify-email').send({ token: 'abc' })).status).toBe(400);
        expect((await request(app).post('/api/auth/verify-email').send({})).status).toBe(400);
        s.tokens.push({ id: 1, user_id: 1, kind: 'verify', hash: hash('a'.repeat(64)), used: false, expired: true, at: 0 });
        expect((await request(app).post('/api/auth/verify-email').send({ token: 'a'.repeat(64) })).status).toBe(400);
    });
    test('a reset token cannot confirm an email', async () => {
        s.tokens.push({ id: 1, user_id: 1, kind: 'reset', hash: hash('b'.repeat(64)), used: false, at: 0 });
        expect((await request(app).post('/api/auth/verify-email').send({ token: 'b'.repeat(64) })).status).toBe(400);
    });
    test('resend: one per minute, nothing for an already confirmed address', async () => {
        const h = as(1, 'student');
        expect((await request(app).post('/api/auth/resend-verification').set(h)).status).toBe(200);
        expect((await request(app).post('/api/auth/resend-verification').set(h)).status).toBe(429);
        s.users[0].verified = 1;
        expect((await request(app).post('/api/auth/resend-verification').set(h)).body.message).toMatch(/already/);
    });
});

describe('forgot and reset password', () => {
    test('same answer for a known and an unknown email; mail only for the known one', async () => {
        const a = await request(app).post('/api/auth/forgot-password').send({ email: 'ALI@x.uz' });
        const b = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@x.uz' });
        expect(a.status).toBe(200); expect(b.status).toBe(200);
        expect(a.body).toEqual(b.body);
        expect(mails).toHaveLength(1);
        expect(mails[0].to).toBe('ali@x.uz');
    });
    test('a second request within a minute sends nothing new', async () => {
        await request(app).post('/api/auth/forgot-password').send({ email: 'ali@x.uz' });
        await request(app).post('/api/auth/forgot-password').send({ email: 'ali@x.uz' });
        expect(mails).toHaveLength(1);
    });
    test('503 when mail is not set up, 400 for a bad email', async () => {
        expect((await request(app).post('/api/auth/forgot-password').send({ email: 'nope' })).status).toBe(400);
        delete process.env.BREVO_API_KEY;
        expect((await request(app).post('/api/auth/forgot-password').send({ email: 'ali@x.uz' })).status).toBe(503);
    });
    test('the link sets a new password once; weak passwords are refused first', async () => {
        await request(app).post('/api/auth/forgot-password').send({ email: 'ali@x.uz' });
        const token = tokenFromMail();
        expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'short' })).status).toBe(400);
        expect(s.tokens[0].used).toBe(false); // a weak password does not burn the link
        expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'NewPassword123!' })).status).toBe(200);
        expect(await bcrypt.compare('NewPassword123!', s.users[0].password)).toBe(true);
        expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'Another123!!' })).status).toBe(400);
    });
});

describe('optional rule: teachers need a confirmed email', () => {
    const create = () => request(app).post('/api/teacher/courses').set(as(1, 'teacher')).send({ title: 'Python', description: 'x', category: 'IT' });
    test('off when switched off', async () => {
        process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
        expect((await create()).status).not.toBe(403);
    });
    test('on: unconfirmed teachers are stopped, confirmed ones continue', async () => {
        process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
        const r = await create();
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('EMAIL_NOT_VERIFIED');
        s.users[0].verified = 1;
        expect((await create()).status).not.toBe(403);
        delete process.env.REQUIRE_EMAIL_VERIFICATION;
    });
});
