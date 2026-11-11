// Teams + orders routes. In-memory fake database, no MySQL needed.
process.env.JWT_SECRET = 'test-secret-test-secret-123';
process.env.FEATURE_TEAMS = 'true'; // teams are off by default; these tests cover the code for when they are switched on

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const teamsRouter = require('../api/teams');

const CAPTAIN = 1, STUDENT = 2, OTHER = 3, TEACHER = 9;

let s;
const reset = () => {
    s = {
        users: { 1: 'Captain', 2: 'Ali', 3: 'Vali' },
        teams: [], members: [], orders: [], id: 1
    };
};
const norm = (q) => q.replace(/\s+/g, ' ').trim();

const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('INSERT INTO teams')) {
            if (s.teams.some((t) => t.name === p[0])) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
            const t = { id: s.id++, name: p[0], description: p[1], captain_id: p[2], topics_done: 0, achievements: 0 };
            s.teams.push(t);
            return [{ insertId: t.id }];
        }
        if (q.startsWith('INSERT INTO team_members') && q.includes("'active'")) {
            s.members.push({ team_id: p[0], user_id: p[1], status: 'active', anonymous: 0 });
            return [{}];
        }
        if (q.startsWith('INSERT INTO team_members')) {
            s.members.push({ team_id: p[0], user_id: p[1], status: 'pending', anonymous: p[2] });
            return [{}];
        }
        if (q.startsWith('SELECT id, captain_id FROM teams')) return [s.teams.filter((t) => t.id === p[0])];
        if (q.startsWith('SELECT id FROM team_members')) return [s.members.filter((m) => m.team_id === p[0] && m.user_id === p[1])];
        if (q.startsWith('SELECT t.id, t.name')) {
            return [s.teams.map((t) => ({ ...t, members: s.members.filter((m) => m.team_id === t.id && m.status === 'active').length }))];
        }
        if (q.startsWith('SELECT m.user_id, m.status')) {
            return [s.members.filter((m) => m.team_id === p[0]).map((m) => ({ ...m, full_name: s.users[m.user_id] }))];
        }
        if (q.startsWith("UPDATE team_members SET status = 'active'")) {
            const m = s.members.find((x) => x.team_id === p[0] && x.user_id === p[1] && x.status === 'pending');
            if (m) m.status = 'active';
            return [{ affectedRows: m ? 1 : 0 }];
        }
        if (q.startsWith('DELETE FROM team_members')) {
            const n = s.members.length;
            s.members = s.members.filter((x) => !(x.team_id === p[0] && x.user_id === p[1]));
            return [{ affectedRows: n - s.members.length }];
        }
        if (q.startsWith('INSERT INTO orders')) {
            const o = { id: s.id++, user_id: p[0], kind: p[1], item_title: p[2], amount: p[3], note: p[4], status: 'pending', full_name: s.users[p[0]] };
            s.orders.push(o);
            return [{ insertId: o.id }];
        }
        if (q.includes('FROM orders WHERE user_id = ?')) return [s.orders.filter((o) => o.user_id === p[0])];
        if (q.includes("FROM orders o JOIN users u ON o.user_id = u.id WHERE o.status = 'pending'")) return [s.orders.filter((o) => o.status === 'pending')];
        if (q.startsWith('UPDATE orders SET status = ?')) {
            const o = s.orders.find((x) => x.id === p[1] && x.status === 'pending');
            if (o) o.status = p[0];
            return [{ affectedRows: o ? 1 : 0 }];
        }
        throw new Error('Unexpected query in test: ' + q);
    },
    query: async () => [[]]
};

const as = (userId, role = 'student') => ({
    Authorization: `Bearer ${jwt.sign({ userId, email: `u${userId}@example.com`, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
});

beforeAll(() => app.setDb(fakeDb));
beforeEach(reset);

const makeTeam = () => request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: 'Alfa', description: 'Test' });

describe('rating', () => {
    test('topics x2 + achievements x10', () => {
        expect(teamsRouter.rating({ topics_done: 5, achievements: 2 })).toBe(30);
    });
});

describe('teams', () => {
    test('requires login', async () => {
        expect((await request(app).get('/api/teams')).status).toBe(401);
    });

    test('creator becomes captain and active member', async () => {
        const res = await makeTeam();
        expect(res.status).toBe(201);
        expect(s.teams[0].captain_id).toBe(CAPTAIN);
        expect(s.members[0]).toMatchObject({ user_id: CAPTAIN, status: 'active' });
    });

    test('rejects empty and duplicate names', async () => {
        expect((await request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: '  ' })).status).toBe(400);
        await makeTeam();
        expect((await makeTeam()).status).toBe(409);
    });

    test('lists teams sorted by rating', async () => {
        await makeTeam();
        await request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: 'Beta' });
        s.teams[1].achievements = 3;
        const res = await request(app).get('/api/teams').set(as(STUDENT));
        expect(res.body.teams.map((t) => t.name)).toEqual(['Beta', 'Alfa']);
        expect(res.body.teams[0].rating).toBe(30);
    });

    test('join request, no duplicates, unknown team', async () => {
        const { body } = await makeTeam();
        expect((await request(app).post(`/api/teams/${body.id}/join`).set(as(STUDENT)).send({})).status).toBe(201);
        expect((await request(app).post(`/api/teams/${body.id}/join`).set(as(STUDENT)).send({})).status).toBe(409);
        expect((await request(app).post('/api/teams/99/join').set(as(STUDENT)).send({})).status).toBe(404);
        expect((await request(app).post('/api/teams/abc/join').set(as(STUDENT)).send({})).status).toBe(400);
    });

    test('only the captain can accept or remove', async () => {
        const { body } = await makeTeam();
        await request(app).post(`/api/teams/${body.id}/join`).set(as(STUDENT)).send({});
        expect((await request(app).post(`/api/teams/${body.id}/members/${STUDENT}/accept`).set(as(OTHER))).status).toBe(403);
        expect((await request(app).post(`/api/teams/${body.id}/members/${STUDENT}/accept`).set(as(CAPTAIN))).status).toBe(200);
        expect(s.members.find((m) => m.user_id === STUDENT).status).toBe('active');
        expect((await request(app).delete(`/api/teams/${body.id}/members/${STUDENT}`).set(as(OTHER))).status).toBe(403);
        expect((await request(app).delete(`/api/teams/${body.id}/members/${STUDENT}`).set(as(CAPTAIN))).status).toBe(200);
        expect(s.members.find((m) => m.user_id === STUDENT)).toBeUndefined();
    });

    test('captain cannot be removed', async () => {
        const { body } = await makeTeam();
        expect((await request(app).delete(`/api/teams/${body.id}/members/${CAPTAIN}`).set(as(CAPTAIN))).status).toBe(400);
    });

    test('anonymous members are hidden from non-captains; pending hidden too', async () => {
        const { body } = await makeTeam();
        await request(app).post(`/api/teams/${body.id}/join`).set(as(STUDENT)).send({ anonymous: true });
        await request(app).post(`/api/teams/${body.id}/members/${STUDENT}/accept`).set(as(CAPTAIN));
        await request(app).post(`/api/teams/${body.id}/join`).set(as(OTHER)).send({});

        const asOther = await request(app).get(`/api/teams/${body.id}/members`).set(as(OTHER));
        expect(asOther.body.members).toEqual([
            { user_id: CAPTAIN, name: 'Captain', status: 'active' },
            { user_id: null, name: 'Anonim', status: 'active' }
        ]);
        const asCaptain = await request(app).get(`/api/teams/${body.id}/members`).set(as(CAPTAIN));
        expect(asCaptain.body.members).toHaveLength(3);
        expect(asCaptain.body.members[1].name).toBe('Ali');
    });
});
