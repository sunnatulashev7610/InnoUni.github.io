// Seasonal tournament, step 1: create, register teams, draw groups and fixtures
process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');

let fake;
const as = (uid, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId: uid, email: `u${uid}@example.com`, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const adm = (m, path, body) => request(app)[m]('/api/admin/tournaments' + path).set(as(99, 'admin')).send(body || {});
const get = (who) => request(app).get('/api/tournaments').set(as(who));
const reg = (id, who, team) => request(app).post(`/api/tournaments/${id}/register`).set(as(who)).send({ team_id: team });
const leave = (id, who, team) => request(app).post(`/api/tournaments/${id}/withdraw`).set(as(who)).send({ team_id: team });

// Team k has admin 100+k and three active members (200+k*10 ...)
async function team(k, members = 2) {
    const t = (await request(app).post('/api/teams').set(as(100 + k)).send({ name: 'Jamoa ' + k, direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
    for (let i = 0; i < members; i++) fake.addMember(t, 200 + k * 10 + i, 'active');
    return t;
}
async function open(n) {
    const id = (await adm('post', '', { title: 'Kuz kubogi', topic: 'Python', round_days: 2 })).body.id;
    const teams = [];
    for (let k = 1; k <= n; k++) { const t = await team(k); teams.push(t); expect((await reg(id, 100 + k, t)).status).toBe(201); }
    return { id, teams };
}

beforeEach(() => { fake = createTeamsFake(); app.setDb(fake.db); });

describe('creating', () => {
    test('only platform admins create tournaments; title, topic and round length are checked', async () => {
        expect((await request(app).post('/api/admin/tournaments').set(as(5)).send({ title: 'A', topic: 'B' })).status).toBe(403);
        expect((await adm('post', '', { title: '', topic: 'B' })).status).toBe(400);
        expect((await adm('post', '', { title: 'A', topic: '' })).status).toBe(400);
        expect((await adm('post', '', { title: 'A', topic: 'B', round_days: 0 })).status).toBe(400);
        expect((await adm('post', '', { title: 'A', topic: 'B', round_days: 8 })).status).toBe(400);
        expect((await adm('post', '', { title: 'A', topic: 'B' })).status).toBe(201);
        expect(fake.s.tournaments[0].round_days).toBe(2);
    });
});

describe('registering', () => {
    test('the admin of a team with enough active members registers it; it shows in the list', async () => {
        const { id, teams } = await open(1);
        const r = (await get(101)).body;
        expect(r.tournaments[0]).toMatchObject({ id, title: 'Kuz kubogi', status: 'open', teams: [{ team_id: teams[0], name: 'Jamoa 1', group_no: null, mine: true }] });
        expect(r.my_admin_teams).toEqual([{ id: teams[0], name: 'Jamoa 1', members: 3 }]);
        expect((await get(102)).body.tournaments[0].teams[0].mine).toBe(false);
    });
    test('refused: not the admin, too few members, twice, unknown team or tournament', async () => {
        const id = (await adm('post', '', { title: 'K', topic: 'P' })).body.id;
        const t1 = await team(1); const small = await team(2, 1);
        expect((await reg(id, 105, t1)).status).toBe(403);
        expect((await reg(id, 102, small)).status).toBe(400);
        expect((await reg(id, 101, t1)).status).toBe(201);
        expect((await reg(id, 101, t1)).status).toBe(409);
        expect((await reg(id, 101, 999)).status).toBe(404);
        expect((await reg(999, 101, t1)).status).toBe(404);
        expect((await reg(id, 101, undefined)).status).toBe(400);
    });
    test('at most 16 teams', async () => {
        const { id } = await open(16);
        const extra = await team(17);
        expect((await reg(id, 117, extra)).status).toBe(409);
    });
    test('a team can leave before the draw, and only its admin can do it', async () => {
        const { id, teams } = await open(1);
        expect((await leave(id, 105, teams[0])).status).toBe(403);
        expect((await leave(id, 101, teams[0])).status).toBe(200);
        expect((await leave(id, 101, teams[0])).status).toBe(404);
        expect(fake.s.tt).toHaveLength(0);
    });
    test('the admin can remove a team while registration is open', async () => {
        const { id, teams } = await open(2);
        expect((await adm('post', `/${id}/remove-team`, { team_id: teams[1] })).status).toBe(200);
        expect((await adm('post', `/${id}/remove-team`, { team_id: teams[1] })).status).toBe(404);
        expect((await request(app).post(`/api/admin/tournaments/${id}/remove-team`).set(as(5)).send({ team_id: teams[0] })).status).toBe(403);
    });
});

describe('the draw', () => {
    test('needs a count that makes groups; says how many there are', async () => {
        const { id } = await open(5);
        const r = await adm('post', `/${id}/draw`);
        expect(r.status).toBe(400); expect(r.body.error).toContain('now there are 5');
        expect(fake.s.tournaments[0].status).toBe('open');
    });
    test('8 teams: two groups of 4, strongest split, 6 matches per group in 3 rounds, everybody told once', async () => {
        const { id, teams } = await open(8);
        teams.forEach((t, i) => { fake.s.stats[t] = { rating: 1000 + (8 - i) * 10, played: 1, wins: 0 }; });   // team 1 strongest ... team 8 weakest
        fake.s.notices.length = 0;
        expect((await adm('post', `/${id}/draw`)).body).toEqual({ status: 'groups', groups: 2 });
        const t = (await get(101)).body.tournaments[0];
        expect(t.status).toBe('groups');
        const groupOf = (k) => t.teams.find((x) => x.team_id === teams[k - 1]).group_no;
        expect([groupOf(1), groupOf(2), groupOf(3), groupOf(4)]).toEqual([1, 2, 2, 1]);   // snake: A B B A
        expect(t.teams.filter((x) => x.group_no === 1)).toHaveLength(4);
        expect(t.teams.find((x) => x.team_id === teams[0]).seed_rating).toBe(1080);
        expect(t.matches).toHaveLength(12);
        expect(t.matches.every((m) => m.stage === 'group' && m.battle_id === null)).toBe(true);
        [1, 2, 3].forEach((r) => [1, 2].forEach((g) => expect(t.matches.filter((m) => m.round_no === r && m.group_no === g)).toHaveLength(2)));
        expect(t.matches[0]).toMatchObject({ name_a: expect.stringMatching(/^Jamoa /), name_b: expect.stringMatching(/^Jamoa /) });
        const told = fake.s.notices.filter((n) => n.kind === 'tournament');
        expect(new Set(told.map((n) => n.user_id)).size).toBe(told.length);
        expect(told).toHaveLength(8 * 3 + 0);   // 3 active members per team (admin + 2)
    });
    test('registration is closed after the draw and the draw cannot be repeated', async () => {
        const { id, teams } = await open(4);
        expect((await adm('post', `/${id}/draw`)).status).toBe(200);
        expect((await adm('post', `/${id}/draw`)).status).toBe(409);
        const late = await team(9);
        expect((await reg(id, 109, late)).status).toBe(409);
        expect((await leave(id, 101, teams[0])).status).toBe(409);
        expect((await adm('post', `/${id}/remove-team`, { team_id: teams[0] })).status).toBe(409);
        expect(fake.s.tm).toHaveLength(6);
    });
    test('only platform admins draw', async () => {
        const { id } = await open(4);
        expect((await request(app).post(`/api/admin/tournaments/${id}/draw`).set(as(101)).send({})).status).toBe(403);
    });
});

describe('cancelling', () => {
    test('a tournament can be cancelled before and after the draw, and then disappears from the list', async () => {
        const { id } = await open(4);
        expect((await adm('post', `/${id}/cancel`)).status).toBe(200);
        expect((await get(101)).body.tournaments).toEqual([]);
        expect((await adm('post', `/${id}/cancel`)).status).toBe(409);
        expect((await reg(id, 101, 1)).status).toBe(404);
    });
});

test('the admin list shows every tournament with its teams', async () => {
    await open(2);
    const r = (await adm('get', '')).body;
    expect(r.tournaments[0].teams).toHaveLength(2);
    expect(r.limits.maxTeams).toBe(16);
    expect((await request(app).get('/api/admin/tournaments').set(as(5))).status).toBe(403);
});
