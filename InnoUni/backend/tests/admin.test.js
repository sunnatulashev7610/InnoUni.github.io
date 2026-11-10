process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');

const ADMIN = 1;
let s;
const reset = () => {
    s = {
        users: [
            { id: 1, full_name: 'Admin', email: 'a@x.uz', role: 'admin', blocked: 0 },
            { id: 2, full_name: 'Ali', email: 'ali@x.uz', role: 'student', blocked: 0 },
            { id: 3, full_name: 'Gulnora', email: 'gulnora@x.uz', role: 'teacher', blocked: 0 }
        ],
        orders: [{ id: 1, status: 'pending', user_id: 2 }, { id: 2, status: 'pending', user_id: 2 }, { id: 3, status: 'confirmed', user_id: 2 }],
        teams: [{ id: 1 }], log: [], lastSql: ''
    };
};
const norm = (q) => q.replace(/\s+/g, ' ').trim();
const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw); s.lastSql = q;
        if (q.startsWith('SELECT role, COUNT(*)')) {
            const c = {}; s.users.forEach((u) => { c[u.role] = (c[u.role] || 0) + 1; });
            return [Object.entries(c).map(([role, n]) => ({ role, n }))];
        }
        if (q.startsWith('SELECT status, COUNT(*)')) {
            const c = {}; s.orders.forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; });
            return [Object.entries(c).map(([status, n]) => ({ status, n }))];
        }
        if (q.startsWith('SELECT COUNT(*) AS n FROM teams')) return [[{ n: s.teams.length }]];
        if (q.startsWith('SELECT id, full_name, email, role, blocked')) {
            let rows = s.users; let i = 0;
            if (q.includes('role = ?')) { const r = p[i++]; rows = rows.filter((u) => u.role === r); }
            if (q.includes('full_name LIKE ?')) { const k = p[i].replace(/%/g, '').toLowerCase(); rows = rows.filter((u) => (u.full_name + u.email).toLowerCase().includes(k)); }
            return [rows];
        }
        if (q.startsWith('UPDATE users SET role = ?')) { const u = s.users.find((x) => x.id === p[1]); if (u) u.role = p[0]; return [{ affectedRows: u ? 1 : 0 }]; }
        if (q.startsWith('UPDATE users SET blocked = ?')) { const u = s.users.find((x) => x.id === p[1]); if (u) u.blocked = p[0]; return [{ affectedRows: u ? 1 : 0 }]; }
        if (q.startsWith('INSERT INTO admin_log')) { s.log.push(p); return [{}]; }
        if (q.startsWith('SELECT * FROM users WHERE email')) return [s.users.filter((u) => u.email === p[0])];
        if (q.startsWith('SELECT t.id, t.name')) return [[]];
        if (q.includes('FROM orders o JOIN users u')) return [s.orders.filter((o) => !q.includes('WHERE o.status = ?') || o.status === p[0])];
        throw new Error('Unexpected query in test: ' + q);
    },
    query: async () => [[]]
};
const as = (userId, role) => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const admin = as(ADMIN, 'admin');

beforeAll(() => app.setDb(fakeDb));
beforeEach(reset);

test('only admins may use /api/admin', async () => {
    expect((await request(app).get('/api/admin/stats')).status).toBe(401);
    expect((await request(app).get('/api/admin/stats').set(as(2, 'student'))).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(as(3, 'teacher'))).status).toBe(403);
    expect((await request(app).post('/api/admin/users/2/block').set(as(3, 'teacher')).send({ blocked: true })).status).toBe(403);
});

test('stats counts users, orders and teams', async () => {
    const res = await request(app).get('/api/admin/stats').set(admin);
    expect(res.body).toEqual({ users: { student: 1, teacher: 1, admin: 1 }, orders: { pending: 2, confirmed: 1, rejected: 0 }, teams: 1 });
});

test('lists and filters users', async () => {
    expect((await request(app).get('/api/admin/users').set(admin)).body.users).toHaveLength(3);
    expect((await request(app).get('/api/admin/users?role=teacher').set(admin)).body.users.map((u) => u.id)).toEqual([3]);
    expect((await request(app).get('/api/admin/users?q=ali').set(admin)).body.users.map((u) => u.id)).toEqual([2]);
    expect((await request(app).get('/api/admin/users?role=boss').set(admin)).status).toBe(400);
});

test('changes a role, logs it, and refuses bad input or self-change', async () => {
    expect((await request(app).post('/api/admin/users/2/role').set(admin).send({ role: 'teacher' })).status).toBe(200);
    expect(s.users[1].role).toBe('teacher');
    expect(s.log).toHaveLength(1);
    expect((await request(app).post('/api/admin/users/2/role').set(admin).send({ role: 'king' })).status).toBe(400);
    expect((await request(app).post('/api/admin/users/1/role').set(admin).send({ role: 'student' })).status).toBe(400);
    expect((await request(app).post('/api/admin/users/99/role').set(admin).send({ role: 'student' })).status).toBe(404);
});

test('block and unblock; cannot block yourself; blocked user cannot log in', async () => {
    s.users[1].password = await bcrypt.hash('password123', 4);
    const login = () => request(app).post('/api/auth/login').send({ email: 'ali@x.uz', password: 'password123' });
    expect((await login()).status).toBe(200);
    expect((await request(app).post('/api/admin/users/2/block').set(admin).send({ blocked: true })).status).toBe(200);
    expect((await login()).status).toBe(403);
    expect((await request(app).post('/api/admin/users/2/block').set(admin).send({ blocked: false })).status).toBe(200);
    expect((await login()).status).toBe(200);
    expect((await request(app).post('/api/admin/users/1/block').set(admin).send({ blocked: true })).status).toBe(400);
    expect((await request(app).post('/api/admin/users/2/block').set(admin).send({ blocked: 'yes' })).status).toBe(400);
});

test('orders can be filtered by status', async () => {
    expect((await request(app).get('/api/admin/orders').set(admin)).body.orders).toHaveLength(3);
    expect((await request(app).get('/api/admin/orders?status=confirmed').set(admin)).body.orders).toHaveLength(1);
    expect((await request(app).get('/api/admin/orders?status=zzz').set(admin)).status).toBe(400);
});
