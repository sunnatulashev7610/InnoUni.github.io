// Teams routes (create, list, join, members). In-memory fake database, no MySQL needed.
process.env.JWT_SECRET = 'test-secret-test-secret-123';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const teamsRouter = require('../api/teams');
const { createTeamsFake } = require('./helpers/teamsFake');

const CAPTAIN = 1, STUDENT = 2, OTHER = 3, TEACHER = 9;

let fake, s;
const reset = () => { fake = createTeamsFake(); s = fake.s; app.setDb(fake.db); };

const as = (userId, role = 'student') => ({
    Authorization: `Bearer ${jwt.sign({ userId, email: `u${userId}@example.com`, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
});

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
        expect(asOther.body.members.map(({ user_id, name, status }) => ({ user_id, name, status }))).toEqual([
            { user_id: CAPTAIN, name: 'Captain', status: 'active' },
            { user_id: null, name: 'Anonim', status: 'active' }
        ]);
        expect(asOther.body.members[0].is_admin).toBe(true);
        const asCaptain = await request(app).get(`/api/teams/${body.id}/members`).set(as(CAPTAIN));
        expect(asCaptain.body.members).toHaveLength(3);
        expect(asCaptain.body.members[1].name).toBe('Ali');
    });
});
