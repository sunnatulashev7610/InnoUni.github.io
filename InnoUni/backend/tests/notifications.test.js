process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId) => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
let s;
const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT role, blocked')) return [[{ role: 'student', blocked: 0 }]];
        if (q.startsWith('SELECT id, kind, title, body, page, ref_id, read_at, created_at FROM notifications WHERE user_id = ?')) return [s.n.filter((x) => x.user_id === p[0]).sort((a, b) => b.id - a.id).slice(0, 30)];
        if (q.startsWith('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')) return [[{ n: s.n.filter((x) => x.user_id === p[0] && !x.read_at).length }]];
        if (q.startsWith('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL')) { s.n.filter((x) => x.user_id === p[0]).forEach((x) => { x.read_at = x.read_at || 1; }); return [{}]; }
        if (q.startsWith('UPDATE notifications SET read_at = COALESCE')) { const x = s.n.find((y) => y.id === p[0] && y.user_id === p[1]); if (x) x.read_at = x.read_at || 1; return [{ affectedRows: x ? 1 : 0 }]; }
        if (q.startsWith('DELETE FROM notifications WHERE user_id = ? AND created_at')) return [{}];
        if (q.startsWith('DELETE FROM notifications WHERE user_id = ?')) { s.n = s.n.filter((x) => x.user_id !== p[0]); return [{}]; }
        if (q.startsWith('INSERT INTO notifications')) { s.n.push({ id: s.n.length + 1, user_id: p[0], kind: p[1], title: p[2], body: p[3], page: p[4], ref_id: p[5], read_at: null, created_at: 'now' }); return [{ insertId: 1 }]; }
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(() => { s = { n: [{ id: 1, user_id: 1, kind: 'grade', title: 'Vazifangiz baholandi', body: 'Baho: 90', page: 'vazifalar', ref_id: null, read_at: null, created_at: 'x' }, { id: 2, user_id: 1, kind: 'answer', title: 'Javob', body: null, page: 'course-detail', ref_id: 5, read_at: 1, created_at: 'y' }, { id: 3, user_id: 2, kind: 'grade', title: 'Boshqaniki', body: null, page: null, ref_id: null, read_at: null, created_at: 'z' }] }; });

test('login is required', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401);
});

test('I see only my notifications, newest first, with the unread count', async () => {
    const r = await request(app).get('/api/notifications').set(as(1));
    expect(r.status).toBe(200);
    expect(r.body.unread).toBe(1);
    expect(r.body.items.map((x) => x.id)).toEqual([2, 1]);
    expect(r.body.items[0]).toMatchObject({ read: true, page: 'course-detail', ref_id: 5 });
    expect(JSON.stringify(r.body)).not.toContain('Boshqaniki');
});

test('marking one as read works only for the owner', async () => {
    expect((await request(app).put('/api/notifications/1/read').set(as(2))).status).toBe(404);
    expect(s.n[0].read_at).toBeNull();
    expect((await request(app).put('/api/notifications/1/read').set(as(1))).status).toBe(200);
    expect(s.n[0].read_at).toBeTruthy();
    expect((await request(app).put('/api/notifications/abc/read').set(as(1))).status).toBe(400);
});

test('read-all and clear touch only my rows', async () => {
    await request(app).put('/api/notifications/read-all').set(as(1));
    expect(s.n.find((x) => x.id === 1).read_at).toBeTruthy();
    expect(s.n.find((x) => x.id === 3).read_at).toBeNull();
    await request(app).delete('/api/notifications').set(as(1));
    expect(s.n.map((x) => x.id)).toEqual([3]);
});

describe('notify helper', () => {
    const { notify } = require('../utils/notify');
    test('stores a trimmed notification and never throws', async () => {
        expect(await notify(fakeDb, 1, { kind: 'x', title: 'T'.repeat(300), body: 'b'.repeat(500), page: 'vazifalar' })).toBe(true);
        const last = s.n[s.n.length - 1];
        expect(last.title).toHaveLength(120); expect(last.body).toHaveLength(300);
        expect(await notify({ execute: async () => { throw new Error('db down'); } }, 1, { kind: 'x', title: 'T' })).toBe(false);
        expect(await notify(fakeDb, null, { kind: 'x', title: 'T' })).toBe(false);
    });
});
