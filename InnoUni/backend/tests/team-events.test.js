// Team meetups: the admin plans, members say "I'm going". Fake database, no MySQL.
process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');

const CAPTAIN = 1, ALI = 2, VALI = 3, DILNOZA = 4;
let fake, team;
const as = (id) => ({ Authorization: `Bearer ${jwt.sign({ userId: id, email: `u${id}@example.com`, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const url = (id = team) => `/api/teams/${id}/events`;
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();
const plan = (who, body) => request(app).post(url()).set(as(who)).send(body);
const good = () => ({ title: 'Haftalik uchrashuv', place: 'Kutubxona', note: 'Savollar bilan keling', starts_at: inDays(2) });

beforeEach(async () => {
    fake = createTeamsFake(); app.setDb(fake.db);
    team = (await request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: 'Alfa', direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
    fake.addMember(team, ALI, 'active'); fake.addMember(team, VALI, 'active'); fake.addMember(team, DILNOZA, 'pending');
});

test('needs a login; only active members see meetups', async () => {
    expect((await request(app).get(url())).status).toBe(401);
    expect((await request(app).get(url()).set(as(DILNOZA))).status).toBe(403);
    expect((await request(app).get(url(999)).set(as(ALI))).status).toBe(404);
});

describe('planning', () => {
    test('only the admin plans; members are told, the admin is not', async () => {
        expect((await plan(ALI, good())).status).toBe(403);
        expect((await plan(CAPTAIN, good())).status).toBe(201);
        expect(fake.s.notices.map((n) => n.user_id).sort()).toEqual([ALI, VALI]);
        expect(fake.s.notices[0]).toMatchObject({ kind: 'team', title: 'Yangi uchrashuv', page: 'jamoalar', ref_id: team });
        const list = (await request(app).get(url()).set(as(ALI))).body.events;
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ title: 'Haftalik uchrashuv', place: 'Kutubxona', going: 0, i_go: false });
        expect(new Date(list[0].starts_at).getTime()).toBeGreaterThan(Date.now());
    });
    test.each([
        [{ title: '' }], [{ title: 'x'.repeat(151) }], [{ place: 'x'.repeat(201) }], [{ note: 'x'.repeat(501) }],
        [{ starts_at: 'ertaga' }], [{ starts_at: undefined }], [{ starts_at: 5 }],
        [{ starts_at: new Date(Date.now() - 3600000).toISOString() }], [{ starts_at: inDays(400) }]
    ])('rejects %p', async (change) => {
        expect((await plan(CAPTAIN, { ...good(), ...change })).status).toBe(400);
    });
    test('place and note are optional; too many upcoming meetups are refused', async () => {
        expect((await plan(CAPTAIN, { title: 'A', starts_at: inDays(1) })).status).toBe(201);
        for (let i = 0; i < 19; i++) await plan(CAPTAIN, { title: 'T' + i, starts_at: inDays(2) });
        expect((await plan(CAPTAIN, good())).status).toBe(400);
    });
    test('list is soonest first and hides meetups older than a day', async () => {
        await plan(CAPTAIN, { title: 'Keyin', starts_at: inDays(5) });
        await plan(CAPTAIN, { title: 'Avval', starts_at: inDays(1) });
        fake.s.events.push({ id: 99, team_id: team, user_id: CAPTAIN, title: 'Eski', place: null, note: null, starts_at: new Date(Date.now() - 3 * 86400000) });
        const list = (await request(app).get(url()).set(as(VALI))).body.events;
        expect(list.map((e) => e.title)).toEqual(['Avval', 'Keyin']);
    });
});

describe('going', () => {
    test('toggles, counts everyone, shows only my own choice', async () => {
        await plan(CAPTAIN, good());
        const id = fake.s.events[0].id;
        expect((await request(app).post(`${url()}/${id}/going`).set(as(ALI))).body.i_go).toBe(true);
        await request(app).post(`${url()}/${id}/going`).set(as(VALI));
        let ev = (await request(app).get(url()).set(as(ALI))).body.events[0];
        expect(ev).toMatchObject({ going: 2, i_go: true });
        expect((await request(app).post(`${url()}/${id}/going`).set(as(ALI))).body.i_go).toBe(false);
        ev = (await request(app).get(url()).set(as(ALI))).body.events[0];
        expect(ev).toMatchObject({ going: 1, i_go: false });
        expect((await request(app).post(`${url()}/999/going`).set(as(ALI))).status).toBe(404);
        expect((await request(app).post(`${url()}/${id}/going`).set(as(DILNOZA))).status).toBe(403);
    });
});

describe('deleting', () => {
    test('only the admin; the answers go too', async () => {
        await plan(CAPTAIN, good());
        const id = fake.s.events[0].id;
        await request(app).post(`${url()}/${id}/going`).set(as(ALI));
        expect((await request(app).delete(`${url()}/${id}`).set(as(ALI))).status).toBe(403);
        expect((await request(app).delete(`${url()}/${id}`).set(as(CAPTAIN))).status).toBe(200);
        expect(fake.s.events).toHaveLength(0); expect(fake.s.going).toHaveLength(0);
        expect((await request(app).delete(`${url()}/${id}`).set(as(CAPTAIN))).status).toBe(404);
    });
});
