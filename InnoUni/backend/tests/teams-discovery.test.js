// Finding teams: interests, recommendations, "not taking people now", join notice. Fake database, no MySQL.
process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');

const CAPTAIN = 1, ALI = 2, VALI = 3;
let fake, s;
beforeEach(() => { fake = createTeamsFake(); s = fake.s; app.setDb(fake.db); });
const as = (id) => ({ Authorization: `Bearer ${jwt.sign({ userId: id, email: `u${id}@example.com`, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const open = (name, direction, by = CAPTAIN) => request(app).post('/api/teams').set(as(by)).send({ name, direction, sphere: 'Soha', goals: 'Maqsad' }).then((r) => r.body.id);
const say = (team, who, n) => Promise.all(Array.from({ length: n }, (_, i) => request(app).post(`/api/teams/${team}/messages`).set(as(who)).send({ body: 'salom ' + i })));

describe('interests', () => {
    test('empty at first, saved as a list, replaced on the next save', async () => {
        expect((await request(app).get('/api/teams/interests').set(as(ALI))).body.interests).toEqual([]);
        const put = await request(app).put('/api/teams/interests').set(as(ALI)).send({ directions: ['Dasturlash', 'Til', 'Til'] });
        expect(put.body.interests).toEqual(['Dasturlash', 'Til']);
        await request(app).put('/api/teams/interests').set(as(ALI)).send({ directions: ['Dizayn'] });
        expect((await request(app).get('/api/teams/interests').set(as(ALI))).body.interests).toEqual(['Dizayn']);
        expect((await request(app).get('/api/teams/interests').set(as(VALI))).body.interests).toEqual([]);
    });
    test.each([[undefined], ['Dasturlash'], [['Yo\'q']], [[1]], [['Dasturlash', 'Dizayn', 'Til', 'Fan', 'Biznes', 'Boshqa', 'Boshqa']]])('rejects %p', async (v) => {
        expect((await request(app).put('/api/teams/interests').set(as(ALI)).send({ directions: v })).status).toBe(400);
    });
    test('needs a login', async () => {
        expect((await request(app).put('/api/teams/interests').send({ directions: [] })).status).toBe(401);
    });
});

describe('recommended', () => {
    test('asks for interests first', async () => {
        await open('Alfa', 'Dasturlash');
        const res = await request(app).get('/api/teams/recommended').set(as(ALI));
        expect(res.body).toMatchObject({ teams: [], needs_interests: true });
    });
    test('only my directions, taking people, not mine; the most active first', async () => {
        const quiet = await open('Jim', 'Dasturlash');
        const busy = await open('Faol', 'Dasturlash');
        await open('Dizayn klub', 'Dizayn');
        const closed = await open('Yopiq', 'Dasturlash');
        const mineTeam = await open('Meniki', 'Dasturlash', VALI);
        await request(app).put(`/api/teams/${closed}`).set(as(CAPTAIN)).send({ recruiting: false });
        await request(app).post(`/api/teams/${mineTeam}/join`).set(as(ALI)).send({});
        await say(busy, CAPTAIN, 3);
        await request(app).put('/api/teams/interests').set(as(ALI)).send({ directions: ['Dasturlash'] });
        const res = await request(app).get('/api/teams/recommended').set(as(ALI));
        expect(res.body.needs_interests).toBe(false);
        expect(res.body.teams.map((t) => t.name)).toEqual(['Faol', 'Jim']);
        void quiet;
    });
    test('a team the person opened is not recommended back', async () => {
        await open('Alfa', 'Dasturlash');
        await request(app).put('/api/teams/interests').set(as(CAPTAIN)).send({ directions: ['Dasturlash'] });
        expect((await request(app).get('/api/teams/recommended').set(as(CAPTAIN))).body.teams).toEqual([]);
    });
});

describe('taking new people', () => {
    test('only the admin changes it; it must be true or false', async () => {
        const id = await open('Alfa', 'Til');
        expect((await request(app).put(`/api/teams/${id}`).set(as(ALI)).send({ recruiting: false })).status).toBe(403);
        expect((await request(app).put(`/api/teams/${id}`).set(as(CAPTAIN)).send({ recruiting: 'no' })).status).toBe(400);
        const ok = await request(app).put(`/api/teams/${id}`).set(as(CAPTAIN)).send({ recruiting: false });
        expect(ok.body.team.recruiting).toBe(false);
        expect((await request(app).get('/api/teams').set(as(ALI))).body.teams[0].recruiting).toBe(false);
    });
    test('a closed team refuses join requests; opening it again allows them', async () => {
        const id = await open('Alfa', 'Til');
        await request(app).put(`/api/teams/${id}`).set(as(CAPTAIN)).send({ recruiting: false });
        const no = await request(app).post(`/api/teams/${id}/join`).set(as(ALI)).send({});
        expect(no.status).toBe(409);
        expect(no.body.code).toBe('NOT_RECRUITING');
        await request(app).put(`/api/teams/${id}`).set(as(CAPTAIN)).send({ recruiting: true });
        expect((await request(app).post(`/api/teams/${id}/join`).set(as(ALI)).send({})).status).toBe(201);
    });
    test('the admin is told about a request, without the name when it is anonymous', async () => {
        const id = await open('Alfa', 'Til');
        await request(app).post(`/api/teams/${id}/join`).set(as(ALI)).send({ anonymous: true });
        expect(s.notices).toHaveLength(1);
        expect(s.notices[0]).toMatchObject({ user_id: CAPTAIN, kind: 'team', page: 'jamoalar', ref_id: id });
        expect(JSON.stringify(s.notices[0])).not.toContain('Ali');
    });
});
