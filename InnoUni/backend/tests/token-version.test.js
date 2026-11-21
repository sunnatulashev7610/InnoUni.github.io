process.env.JWT_SECRET = 'test-secret-test-secret-123';
process.env.AUTH_RATE_LIMIT = '1000'; // this file tests the per-account lock, not the IP limiter
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../server');
const loginGuard = require('../utils/loginGuard');
const { invalidateUserCache } = require('../middleware/roleBased');

const norm = (q) => q.replace(/\s+/g, ' ').trim();
let s;
const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT role, blocked')) { const u = s.users.find((x) => x.id === p[0]); return [u ? [{ role: u.role, blocked: u.blocked, token_version: u.token_version }] : []]; }
        if (q.startsWith('SELECT * FROM users WHERE LOWER(email) = ?')) return [s.users.filter((u) => u.email === p[0])];
        if (q.startsWith('SELECT password FROM users WHERE id = ?')) return [s.users.filter((u) => u.id === p[0]).map((u) => ({ password: u.password }))];
        if (q.startsWith('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?')) { const u = s.users.find((x) => x.id === p[1]); u.password = p[0]; u.token_version += 1; return [{}]; }
        if (q.startsWith('SELECT email, role, token_version FROM users WHERE id = ?')) return [s.users.filter((u) => u.id === p[0]).map((u) => ({ email: u.email, role: u.role, token_version: u.token_version }))];
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(() => {
    s = { users: [{ id: 1, email: 'ali@x.uz', password: bcrypt.hashSync('correct-horse-1', 4), role: 'student', blocked: 0, token_version: 0 }] };
    loginGuard.reset(); invalidateUserCache();
});
const login = (password = 'correct-horse-1', email = 'ali@x.uz') => request(app).post('/api/auth/login').send({ email, password });
const verify = (token) => request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`);

test('a login token carries the token version and works', async () => {
    const r = await login(); expect(r.status).toBe(200);
    expect(jwt.decode(r.body.token).tv).toBe(0);
    expect((await verify(r.body.token)).status).toBe(200);
});

test('changing the password signs out other devices but keeps this one', async () => {
    const old = (await login()).body.token;
    const r = await request(app).put('/api/auth/password').set('Authorization', `Bearer ${old}`).send({ current_password: 'correct-horse-1', new_password: 'another-pass-22' });
    expect(r.status).toBe(200);
    expect(jwt.decode(r.body.token).tv).toBe(1);
    expect((await verify(old)).status).toBe(401);
    expect((await verify(old)).body.code).toBe('SESSION_EXPIRED');
    expect((await verify(r.body.token)).status).toBe(200);
    expect((await login('another-pass-22')).status).toBe(200);
});

test('a token made before the bump is refused, a blocked account is still refused', async () => {
    const t = (await login()).body.token;
    s.users[0].token_version = 3; invalidateUserCache();
    expect((await verify(t)).status).toBe(401);
    const fresh = jwt.sign({ userId: 1, email: 'ali@x.uz', role: 'student', tv: 3 }, process.env.JWT_SECRET);
    expect((await verify(fresh)).status).toBe(200);
    s.users[0].blocked = 1; invalidateUserCache();
    expect((await verify(fresh)).status).toBe(403);
});

test('old tokens without the claim keep working until the first bump', async () => {
    const legacy = jwt.sign({ userId: 1, email: 'ali@x.uz', role: 'student' }, process.env.JWT_SECRET);
    expect((await verify(legacy)).status).toBe(200);
    s.users[0].token_version = 1; invalidateUserCache();
    expect((await verify(legacy)).status).toBe(401);
});

test('10 wrong passwords lock the account: even the right password waits', async () => {
    for (let i = 0; i < 10; i++) expect((await login('wrong-password')).status).toBe(401);
    const locked = await login('correct-horse-1');
    expect(locked.status).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
});

test('unknown emails are counted too, so the lock does not reveal which accounts exist', async () => {
    for (let i = 0; i < 10; i++) await login('x', 'nobody@x.uz');
    expect((await login('x', 'nobody@x.uz')).status).toBe(429);
});

test('a successful login clears the failures; another account is not affected', async () => {
    for (let i = 0; i < 9; i++) await login('wrong-password');
    expect((await login()).status).toBe(200);
    for (let i = 0; i < 9; i++) await login('wrong-password');
    expect((await login()).status).toBe(200);
    for (let i = 0; i < 10; i++) await login('x', 'other@x.uz');
    expect((await login()).status).toBe(200);
});

test('non-string credentials are rejected without touching the database', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: { $ne: 1 }, password: ['x'] });
    expect(r.status).toBe(400);
});
