// Teams + orders routes. In-memory fake database, no MySQL needed.
process.env.JWT_SECRET = 'test-secret-test-secret-123';

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
            const t = { id: s.id++, name: p[0], description: p[1], direction: p[2], sphere: p[3], goals: p[4], captain_id: p[5], topics_done: 0, achievements: 0, created_at: '2026-11-13T09:00:00.000Z' };
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
        if (q.startsWith('SELECT COUNT(*) AS n FROM teams WHERE captain_id')) return [[{ n: s.teams.filter((t) => t.captain_id === p[0]).length }]];
        if (q.startsWith('SELECT t.id, t.name')) {
            // p = [viewer, viewer] for the list, [viewer, viewer, teamId] for one team; newest first like the real ORDER BY
            const rows = s.teams.filter((t) => p.length < 3 || t.id === p[2]).sort((a, b) => b.id - a.id);
            return [rows.map((t) => {
                const mine = s.members.find((m) => m.team_id === t.id && m.user_id === p[0]);
                return {
                    ...t,
                    captain_name: s.users[t.captain_id],
                    members: s.members.filter((m) => m.team_id === t.id && m.status === 'active').length,
                    my_status: mine ? mine.status : null,
                    pending_requests: t.captain_id === p[0] ? s.members.filter((m) => m.team_id === t.id && m.status === 'pending').length : 0
                };
            })];
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

const details = { direction: 'Dasturlash', sphere: 'Veb dasturlash', goals: 'Loyiha qilish\nOlimpiadaga tayyorlanish' };
const makeTeam = () => request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: 'Alfa', description: 'Test', ...details });

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
        expect((await request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: '  ', ...details })).status).toBe(400);
        await makeTeam();
        expect((await makeTeam()).status).toBe(409);
    });

    test('direction, sphere and goals are required and checked', async () => {
        const send = (extra) => request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: 'Alfa', ...details, ...extra });
        for (const bad of [
            { direction: undefined }, { direction: 'Ixtiyoriy' }, { direction: 5 },
            { sphere: '  ' }, { sphere: 'x'.repeat(101) }, { sphere: { a: 1 } },
            { goals: '' }, { goals: 'x'.repeat(501) }, { goals: undefined },
        ]) {
            expect([JSON.stringify(bad), (await send(bad)).status]).toEqual([JSON.stringify(bad), 400]);
        }
        expect(s.teams).toHaveLength(0);
        expect((await send({ description: undefined })).status).toBe(201); // the description stays optional
    });

    test('the saved team keeps the trimmed direction, sphere and goals', async () => {
        await request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: 'Alfa', direction: ' Til ', sphere: '  IELTS ', goals: ' 7 ball olish ' });
        expect(s.teams[0]).toMatchObject({ direction: 'Til', sphere: 'IELTS', goals: '7 ball olish' });
    });

    test('one person can open at most 5 teams', async () => {
        for (let i = 1; i <= 5; i++) {
            expect((await request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: 'T' + i, ...details })).status).toBe(201);
        }
        const sixth = await request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: 'T6', ...details });
        expect(sixth.status).toBe(400);
        expect(sixth.body.error).toMatch(/at most 5/);
        expect((await request(app).post('/api/teams').set(as(STUDENT)).send({ name: 'Boshqa', ...details })).status).toBe(201);
    });

    test('the list has the automatic facts: who opened it, when, how many members', async () => {
        const { body } = await makeTeam();
        await request(app).post(`/api/teams/${body.id}/join`).set(as(STUDENT)).send({});
        await request(app).post(`/api/teams/${body.id}/members/${STUDENT}/accept`).set(as(CAPTAIN));
        await request(app).post(`/api/teams/${body.id}/join`).set(as(OTHER)).send({}); // still pending: not counted
        const res = await request(app).get('/api/teams').set(as(OTHER));
        expect(res.body.directions).toContain('Dasturlash');
        expect(res.body.teams[0]).toMatchObject({
            name: 'Alfa', direction: 'Dasturlash', sphere: 'Veb dasturlash', goals: details.goals,
            captain_name: 'Captain', created_at: '2026-11-13T09:00:00.000Z', members: 2,
            my_status: 'pending', is_captain: false, pending_requests: 0
        });
    });

    test('the viewer sees their own status; only the captain sees the waiting requests', async () => {
        const { body } = await makeTeam();
        await request(app).post(`/api/teams/${body.id}/join`).set(as(STUDENT)).send({});
        const cap = (await request(app).get('/api/teams').set(as(CAPTAIN))).body.teams[0];
        expect(cap).toMatchObject({ is_captain: true, my_status: 'active', pending_requests: 1 });
        const stu = (await request(app).get('/api/teams').set(as(STUDENT))).body.teams[0];
        expect(stu).toMatchObject({ is_captain: false, my_status: 'pending', pending_requests: 0 });
        const none = (await request(app).get('/api/teams').set(as(OTHER))).body.teams[0];
        expect(none).toMatchObject({ my_status: null, pending_requests: 0 });
    });

    test('newer teams come first when the rating is equal', async () => {
        await makeTeam();
        await request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: 'Beta', ...details });
        const res = await request(app).get('/api/teams').set(as(STUDENT));
        expect(res.body.teams.map((t) => t.name)).toEqual(['Beta', 'Alfa']);
    });

    test('one team by id, 404 for an unknown one, 400 for a bad id', async () => {
        const { body } = await makeTeam();
        const ok = await request(app).get(`/api/teams/${body.id}`).set(as(STUDENT));
        expect(ok.status).toBe(200);
        expect(ok.body.team).toMatchObject({ id: body.id, name: 'Alfa', captain_name: 'Captain', members: 1, my_status: null });
        expect((await request(app).get('/api/teams/99').set(as(STUDENT))).status).toBe(404);
        expect((await request(app).get('/api/teams/abc').set(as(STUDENT))).status).toBe(400);
    });

    test('lists teams sorted by rating', async () => {
        await makeTeam();
        await request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: 'Beta', ...details });
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
