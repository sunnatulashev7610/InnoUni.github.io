process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

let calls, taken;
const row = { id: 7, full_name: 'Ali Valiyev', email: 'ali@x.uz', phone: '+998901234567', bio: 'Salom', avatar: null, role: 'student' };
beforeEach(() => {
    calls = []; taken = false;
    app.setDb({
        execute: async (sql, params) => {
            calls.push({ sql, params });
            if (/SELECT id FROM users WHERE email/.test(sql)) return [taken ? [{ id: 99 }] : []];
            if (/SELECT id, full_name/.test(sql)) return [[row]];
            return [{ affectedRows: 1 }];
        },
        query: async () => [[]],
    });
});
const auth = () => ({ Authorization: `Bearer ${jwt.sign({ userId: 7, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const put = (body) => request(app).put('/api/auth/profile').set(auth()).send(body);
const updateCall = () => calls.find((c) => /^UPDATE users/.test(c.sql));

describe('PUT /api/auth/profile', () => {
    test('needs a login', async () => {
        expect((await request(app).put('/api/auth/profile').send({ full_name: 'Ali' })).status).toBe(401);
    });

    test('updates all fields, trims and lowercases, returns the user', async () => {
        const res = await put({ full_name: '  Ali   Valiyev ', email: ' ALI@X.uz ', phone: '+998 90 123 45 67', bio: ' Salom ' });
        expect(res.status).toBe(200);
        expect(res.body.user.email).toBe('ali@x.uz');
        expect(updateCall().params).toEqual(['Ali Valiyev', 'ali@x.uz', '+998 90 123 45 67', 'Salom', 7]);
    });

    test('a partial update changes only what was sent', async () => {
        await put({ bio: 'Yangi' });
        expect(updateCall().sql).toBe('UPDATE users SET bio = ? WHERE id = ?');
    });

    test('an empty phone or bio clears the value', async () => {
        await put({ phone: '', bio: '' });
        expect(updateCall().params).toEqual([null, null, 7]);
    });

    test.each([
        [{ full_name: 'A' }], [{ full_name: 'x'.repeat(101) }], [{ full_name: { $ne: 1 } }],
        [{ email: 'bad' }], [{ email: 5 }], [{ phone: 'abc' }], [{ phone: '1'.repeat(30) }],
        [{ bio: 'x'.repeat(501) }], [{}],
    ])('rejects %j', async (body) => {
        expect((await put(body)).status).toBe(400);
        expect(updateCall()).toBeUndefined();
    });

    test('rejects an email another account uses', async () => {
        taken = true;
        const res = await put({ email: 'other@x.uz' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/taken/);
        expect(updateCall()).toBeUndefined();
    });

    test('cannot change the role or other columns', async () => {
        await put({ bio: 'x', role: 'admin', id: 1, password: 'hacked12' });
        expect(updateCall().sql).toBe('UPDATE users SET bio = ? WHERE id = ?');
    });
});
