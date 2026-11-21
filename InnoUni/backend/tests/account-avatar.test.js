process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const { register, withAccounts } = require('./helpers/accounts');

let calls, user, owned, admins;
const auth = () => ({ Authorization: `Bearer ${jwt.sign({ userId: 7, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const del = (body) => request(app).delete('/api/auth/account').set(auth()).send(body);
const deleted = () => calls.some((c) => /^DELETE FROM users/.test(c.sql));

beforeEach(() => {
    calls = []; owned = 0; admins = 2;
    user = { id: 7, role: 'student', password: bcrypt.hashSync('Parol123!', 4) };
    register(7, 'student');
    app.setDb(withAccounts({
        execute: async (sql, params) => {
            calls.push({ sql, params });
            if (/^SELECT id, role, password FROM users/.test(sql)) return [[user]];
            if (/^SELECT COUNT\(\*\) AS n FROM users/.test(sql)) return [[{ n: admins }]];
            if (/^SELECT COUNT\(\*\) AS n FROM courses/.test(sql)) return [[{ n: owned }]];
            if (/^SELECT id, full_name/.test(sql)) return [[{ id: 7, avatar: null }]];
            return [{ affectedRows: 1 }];
        },
        query: async () => [[]],
    }));
});

describe('DELETE /api/auth/account', () => {
    test('needs a login', async () => {
        expect((await request(app).delete('/api/auth/account').send({ password: 'x' })).status).toBe(401);
    });
    test('needs the password', async () => {
        expect((await del({})).status).toBe(400);
        expect(deleted()).toBe(false);
    });
    test('a wrong password deletes nothing', async () => {
        expect((await del({ password: 'nope' })).status).toBe(401);
        expect(deleted()).toBe(false);
    });
    test('deletes with the right password', async () => {
        const res = await del({ password: 'Parol123!' });
        expect(res.status).toBe(200);
        expect(calls.find((c) => /^DELETE FROM users/.test(c.sql)).params).toEqual([7]);
    });
    test('a teacher with courses must remove them first', async () => {
        owned = 2;
        const res = await del({ password: 'Parol123!' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('OWNS_COURSES');
        expect(deleted()).toBe(false);
    });
    test('the last admin cannot be deleted', async () => {
        user.role = 'admin'; register(7, 'admin'); admins = 1;
        const res = await del({ password: 'Parol123!' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('LAST_ADMIN');
        expect(deleted()).toBe(false);
    });
    test('an admin may leave when another admin exists', async () => {
        user.role = 'admin'; register(7, 'admin');
        expect((await del({ password: 'Parol123!' })).status).toBe(200);
    });
});

describe('PUT /api/auth/profile avatar', () => {
    const put = (body) => request(app).put('/api/auth/profile').set(auth()).send(body);
    const ok = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
    const upd = () => calls.find((c) => /^UPDATE users/.test(c.sql));

    test('saves a small image', async () => {
        expect((await put({ avatar: ok })).status).toBe(200);
        expect(upd().params).toEqual([ok, 7]);
    });
    test('null removes it', async () => {
        expect((await put({ avatar: null })).status).toBe(200);
        expect(upd().params).toEqual([null, 7]);
    });
    test.each([
        ['svg', 'data:image/svg+xml;base64,PHN2Zz4='],
        ['script', 'data:text/html;base64,PHNjcmlwdD4='],
        ['url', 'https://x.uz/a.png'],
        ['junk', 'data:image/png;base64,<script>'],
        ['number', 5],
    ])('rejects %s', async (_n, v) => {
        expect((await put({ avatar: v })).status).toBe(400);
        expect(upd()).toBeUndefined();
    });
    test('rejects an oversized image', async () => {
        expect((await put({ avatar: 'data:image/png;base64,' + 'A'.repeat(40001) })).status).toBe(400);
    });
});
