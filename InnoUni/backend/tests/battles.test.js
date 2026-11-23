// Team battles, step 1: challenge, answer, start, cancel. Fake database, no MySQL.
process.env.JWT_SECRET = 'test-secret-test-secret-123';
jest.mock('../utils/aiProvider', () => ({ ...jest.requireActual('../utils/aiProvider'), isLive: jest.fn(() => true), battleQuiz: jest.fn() }));
const ai = require('../utils/aiProvider');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');

// Users: 1 admin of Alfa, 2 admin of Beta, 3 admin of Gamma, 4 plain member of Alfa, 5 outsider
let fake, A, B, G;
const as = (id) => ({ Authorization: `Bearer ${jwt.sign({ userId: id, email: `u${id}@example.com`, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const post = (path, who, body) => request(app).post('/api/battles' + path).set(as(who)).send(body || {});
const get = (path, who) => request(app).get('/api/battles' + path).set(as(who));
const good = (extra = {}) => ({ host_team_id: A, title: 'Python battle', topic: 'Python asoslari', kind: 'quiz', duration_days: 2, opponent_team_ids: [B], ...extra });

async function team(name, captain) {
    const id = (await request(app).post('/api/teams').set(as(captain)).send({ name, direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
    [11, 12].forEach((u) => fake.addMember(id, u + captain * 10, 'active')); // two more active members: 3 in total
    return id;
}

beforeEach(async () => {
    ai.isLive.mockReturnValue(true);
    ai.battleQuiz.mockResolvedValue({ questions: Array.from({ length: 10 }, (_, i) => ({ q: 'Savol ' + (i + 1), options: ['a', 'b', 'c', 'd'], answer: i % 4, explanation: 'izoh' })), provider: 'test' });
    fake = createTeamsFake(); app.setDb(fake.db);
    [1, 2, 3, 4, 5].forEach((i) => { fake.s.users[i + 10] = fake.s.users[i + 10] || 'U'; });
    for (let u = 21; u <= 52; u++) fake.s.users[u] = 'M' + u;
    A = await team('Alfa', 1); B = await team('Beta', 2); G = await team('Gamma', 3);
    fake.addMember(A, 4, 'active');
});

describe('challenge', () => {
    test('the admin challenges; the other admin is told; both sides see it', async () => {
        const res = await post('', 1, good());
        expect(res.status).toBe(201);
        expect(fake.s.notices.at(-1)).toMatchObject({ user_id: 2, kind: 'battle', page: 'musobaqalar', ref_id: res.body.id });
        const mine = (await get('', 1)).body.battles;
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ status: 'invited', is_host_admin: true, can_respond: false });
        expect(mine[0].teams.map((t) => [t.name, t.state])).toEqual([['Alfa', 'host'], ['Beta', 'invited']]);
        expect((await get('', 2)).body.battles[0]).toMatchObject({ can_respond: true, is_host_admin: false });
        expect((await get('', 4)).body.battles).toHaveLength(1);   // a plain member sees it too
        expect((await get('', 5)).body.battles).toHaveLength(0);   // an outsider does not
    });
    test('who may challenge and with what', async () => {
        expect((await post('', 4, good())).status).toBe(403);                         // not the admin
        expect((await post('', 1, good({ host_team_id: 999 }))).status).toBe(404);
        expect((await post('', 1, good({ opponent_team_ids: [A] }))).status).toBe(400);
        expect((await post('', 1, good({ opponent_team_ids: [999] }))).status).toBe(404);
        expect((await post('', 1, good({ opponent_team_ids: [] }))).status).toBe(400);
        expect((await post('', 1, good({ opponent_team_ids: 'x' }))).status).toBe(400);
        expect((await post('', 1, good({ kind: 'dance' }))).status).toBe(400);
        expect((await post('', 1, good({ duration_days: 8 }))).status).toBe(400);
        expect((await post('', 1, good({ duration_days: 0 }))).status).toBe(400);
        expect((await post('', 1, good({ title: '' }))).status).toBe(400);
        expect((await post('', 1, good({ topic: 'x'.repeat(201) }))).status).toBe(400);
        expect((await request(app).post('/api/battles').send(good())).status).toBe(401);
    });
    test('every team needs 3 active members', async () => {
        const small = (await request(app).post('/api/teams').set(as(5)).send({ name: 'Kichik', direction: 'Til', sphere: 'S', goals: 'G' })).body.id;
        const r = await post('', 1, good({ opponent_team_ids: [small] }));
        expect(r.status).toBe(400); expect(r.body.error).toContain('Kichik');
        expect((await post('', 5, good({ host_team_id: small }))).status).toBe(400);
    });
    test('the same pair twice a week at most; three open battles per team at most', async () => {
        expect((await post('', 1, good())).status).toBe(201);
        expect((await post('', 1, good())).status).toBe(201);
        expect((await post('', 1, good())).status).toBe(429);
        expect((await post('', 1, good({ opponent_team_ids: [G] }))).status).toBe(201);   // 3 open now
        const D = await team('Delta', 5);
        const r = await post('', 1, good({ opponent_team_ids: [D] }));
        expect(r.status).toBe(400); expect(r.body.error).toContain('open battles');
    });
});

describe('answering', () => {
    let id;
    beforeEach(async () => { id = (await post('', 1, good({ opponent_team_ids: [B, G] }))).body.id; });
    test('only an invited team admin answers; the host is told', async () => {
        expect((await post(`/${id}/respond`, 4, { accept: true })).status).toBe(403);
        expect((await post(`/${id}/respond`, 1, { accept: true })).status).toBe(403);
        expect((await post(`/${id}/respond`, 2, { accept: 'yes' })).status).toBe(400);
        expect((await post(`/${id}/respond`, 2, { accept: true })).body.state).toBe('accepted');
        expect(fake.s.notices.at(-1)).toMatchObject({ user_id: 1, kind: 'battle' });
        expect((await post(`/${id}/respond`, 2, { accept: false })).status).toBe(403);   // already answered
        expect((await post('/999/respond', 2, { accept: true })).status).toBe(404);
    });
    test('if everyone declines the battle is cancelled', async () => {
        await post(`/${id}/respond`, 2, { accept: false });
        expect(fake.s.battles[0].status).toBe('invited');
        const last = await post(`/${id}/respond`, 3, { accept: false });
        expect(last.body.cancelled).toBe(true);
        expect(fake.s.battles[0].status).toBe('cancelled');
    });
    test('a team that shrank below 3 cannot accept', async () => {
        fake.s.members = fake.s.members.filter((m) => !(m.team_id === B && m.user_id !== 2));
        expect((await post(`/${id}/respond`, 2, { accept: true })).status).toBe(400);
    });
});

describe('start and cancel', () => {
    let id;
    beforeEach(async () => { id = (await post('', 1, good({ opponent_team_ids: [B, G] }))).body.id; });
    test('start needs every answer and one acceptance, from the host admin only', async () => {
        expect((await post(`/${id}/start`, 2)).status).toBe(403);
        expect((await post(`/${id}/start`, 1)).status).toBe(400);                  // nobody answered
        await post(`/${id}/respond`, 2, { accept: true });
        expect((await post(`/${id}/start`, 1)).status).toBe(400);                  // Gamma has not answered
        await post(`/${id}/respond`, 3, { accept: false });
        fake.s.notices.length = 0;
        const ok = await post(`/${id}/start`, 1);
        expect(ok.status).toBe(200);
        const b = fake.s.battles[0];
        expect(b.status).toBe('active');
        expect(b.ends_at - b.starts_at).toBe(2 * 86400000);
        const told = fake.s.notices.map((n) => n.user_id);
        expect(told).not.toContain(1);                                              // the starter is not notified
        expect(told).toContain(4);                                                  // a member of the host team is
        expect(told).not.toContain(3 + 20);                                         // Gamma declined: its members are not
        expect((await post(`/${id}/start`, 1)).status).toBe(409);                  // only once
        expect((await post(`/${id}/cancel`, 1)).status).toBe(409);                 // too late to cancel
    });
    test('the host cancels while it waits; invited admins are told', async () => {
        await post(`/${id}/respond`, 2, { accept: true });
        fake.s.notices.length = 0;
        expect((await post(`/${id}/cancel`, 2)).status).toBe(403);
        expect((await post(`/${id}/cancel`, 1)).status).toBe(200);
        expect(fake.s.battles[0].status).toBe('cancelled');
        expect(fake.s.notices.map((n) => n.user_id).sort()).toEqual([2, 3]);
        expect((await post(`/${id}/respond`, 3, { accept: true })).status).toBe(409);
    });
});

describe('detail', () => {
    test('participants open it; others get 404', async () => {
        const id = (await post('', 1, good())).body.id;
        expect((await get(`/${id}`, 2)).body.battle).toMatchObject({ id, title: 'Python battle', kind: 'quiz' });
        expect((await get(`/${id}`, 5)).status).toBe(404);
        expect((await get('/abc', 1)).status).toBe(400);
    });
});
