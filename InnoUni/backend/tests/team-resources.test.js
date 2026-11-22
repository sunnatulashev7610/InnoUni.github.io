// Team resource library: members share links and vote. Fake database, no MySQL.
process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');

const CAPTAIN = 1, ALI = 2, VALI = 3, DILNOZA = 4;
let fake, team;
const as = (id) => ({ Authorization: `Bearer ${jwt.sign({ userId: id, email: `u${id}@example.com`, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const url = (id = team) => `/api/teams/${id}/resources`;
const add = (who, body) => request(app).post(url()).set(as(who)).send(body);
const good = { title: 'Python darsi', url: 'https://example.com/python', note: 'Boshlovchilar uchun' };

beforeEach(async () => {
    fake = createTeamsFake(); app.setDb(fake.db);
    team = (await request(app).post('/api/teams').set(as(CAPTAIN)).send({ name: 'Alfa', direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
    fake.addMember(team, ALI, 'active'); fake.addMember(team, VALI, 'active'); fake.addMember(team, DILNOZA, 'pending');
});

describe('access', () => {
    test('needs a login; strangers and pending people are refused', async () => {
        expect((await request(app).get(url())).status).toBe(401);
        expect((await request(app).get(url()).set(as(DILNOZA))).status).toBe(403);
        expect((await request(app).post(url()).set(as(DILNOZA)).send(good)).status).toBe(403);
        expect((await request(app).get(url(999)).set(as(ALI))).status).toBe(404);
    });
});

describe('adding', () => {
    test('a member adds a link and it appears with the author name', async () => {
        expect((await add(ALI, good)).status).toBe(201);
        const list = (await request(app).get(url()).set(as(VALI))).body.resources;
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ title: 'Python darsi', url: 'https://example.com/python', added_by: 'Ali', votes: 0, voted: false, mine: false });
    });
    test.each([
        [{ ...good, url: 'javascript:alert(1)' }], [{ ...good, url: 'ftp://x.uz/f' }], [{ ...good, url: 'https://user:pw@x.uz' }],
        [{ ...good, url: 'bu havola emas' }], [{ ...good, url: '' }], [{ ...good, url: 5 }],
        [{ ...good, title: '' }], [{ ...good, title: 'x'.repeat(151) }], [{ ...good, note: 'x'.repeat(501) }]
    ])('rejects %p', async (body) => {
        expect((await add(ALI, body)).status).toBe(400);
    });
    test('the note is optional; a hidden name shows as Anonim except to the admin', async () => {
        await add(ALI, { title: 'A', url: 'https://x.uz/a' });
        fake.s.members.find((m) => m.user_id === ALI).anonymous = 1;
        expect((await request(app).get(url()).set(as(VALI))).body.resources[0].added_by).toBe('Anonim');
        expect((await request(app).get(url()).set(as(CAPTAIN))).body.resources[0].added_by).toBe('Ali');
    });
    test('a restricted member cannot add; the daily limit stops spam', async () => {
        fake.s.members.find((m) => m.user_id === VALI).muted_until = Date.now() + 600000;
        expect((await add(VALI, good)).status).toBe(403);
        for (let i = 0; i < 20; i++) await add(ALI, { title: 'T' + i, url: 'https://x.uz/' + i });
        expect((await add(ALI, good)).status).toBe(429);
    });
});

describe('votes', () => {
    test('one vote per person, toggles off, not on your own, best-voted first', async () => {
        await add(ALI, { title: 'Birinchi', url: 'https://x.uz/1' });
        await add(ALI, { title: 'Ikkinchi', url: 'https://x.uz/2' });
        const [one] = fake.s.resources;
        expect((await request(app).post(`${url()}/${one.id}/vote`).set(as(ALI))).status).toBe(400);
        expect((await request(app).post(`${url()}/${one.id}/vote`).set(as(VALI))).body.voted).toBe(true);
        await request(app).post(`${url()}/${one.id}/vote`).set(as(CAPTAIN));
        let list = (await request(app).get(url()).set(as(VALI))).body.resources;
        expect(list.map((r) => r.title)).toEqual(['Birinchi', 'Ikkinchi']);
        expect(list[0]).toMatchObject({ votes: 2, voted: true });
        expect((await request(app).post(`${url()}/${one.id}/vote`).set(as(VALI))).body.voted).toBe(false);
        list = (await request(app).get(url()).set(as(VALI))).body.resources;
        expect(list[0].votes).toBe(1);
        expect((await request(app).post(`${url()}/999/vote`).set(as(VALI))).status).toBe(404);
    });
});

describe('deleting', () => {
    test('the author or the admin may delete, others may not; votes go too', async () => {
        await add(ALI, good);
        const id = fake.s.resources[0].id;
        await request(app).post(`${url()}/${id}/vote`).set(as(VALI));
        expect((await request(app).delete(`${url()}/${id}`).set(as(VALI))).status).toBe(403);
        expect((await request(app).delete(`${url()}/${id}`).set(as(ALI))).status).toBe(200);
        expect(fake.s.resources).toHaveLength(0); expect(fake.s.votes).toHaveLength(0);
        await add(ALI, good);
        expect((await request(app).delete(`${url()}/${fake.s.resources[0].id}`).set(as(CAPTAIN))).status).toBe(200);
        expect((await request(app).delete(`${url()}/777`).set(as(CAPTAIN))).status).toBe(404);
    });
});
