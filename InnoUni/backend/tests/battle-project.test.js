// Project battles, step 4: teams hand in a link, the platform judge scores, the battle closes with places and rating
process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');

let fake, A, B, id;
const as = (uid, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId: uid, email: `u${uid}@example.com`, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const post = (path, who, body) => request(app).post('/api/battles' + path).set(as(who)).send(body || {});
const get = (path, who) => request(app).get('/api/battles' + path).set(as(who));
const adminPost = (path, body, role = 'admin') => request(app).post('/api/admin/battles' + path).set(as(99, role)).send(body || {});
const adminGet = (role = 'admin') => request(app).get('/api/admin/battles').set(as(99, role));
async function team(name, captain, members) {
    const t = (await request(app).post('/api/teams').set(as(captain)).send({ name, direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
    members.forEach((u) => fake.addMember(t, u, 'active')); return t;
}
const endNow = () => { fake.s.battles[0].ends_at = new Date(Date.now() - 1000); };
const hand = (who, link = 'https://github.com/alfa/loyiha', note) => post(`/${id}/submit`, who, { link, note });

beforeEach(async () => {
    fake = createTeamsFake(); app.setDb(fake.db);
    for (let u = 11; u <= 60; u++) fake.s.users[u] = 'M' + u;
    A = await team('Alfa', 1, [21, 22]); B = await team('Beta', 2, [31, 32]);
    id = (await post('', 1, { host_team_id: A, title: 'Sayt battle', topic: 'Portfolio sayt', kind: 'project', duration_days: 2, opponent_team_ids: [B] })).body.id;
    await post(`/${id}/respond`, 2, { accept: true });
    expect((await post(`/${id}/start`, 1)).status).toBe(200);   // a project battle needs no AI
});

describe('handing in', () => {
    test('the admin of a playing team hands in an https link and may replace it until the end', async () => {
        expect((await hand(1, 'https://github.com/alfa/loyiha', 'Birinchi variant')).body).toEqual({ saved: true });
        expect((await hand(1, 'https://github.com/alfa/v2')).status).toBe(200);
        expect(fake.s.subs).toHaveLength(1);
        expect(fake.s.subs[0].link).toBe('https://github.com/alfa/v2');
    });
    test('links must be https; javascript:, http and rubbish are refused', async () => {
        for (const bad of ['javascript:alert(1)', 'http://site.uz', 'abc', '', 'https://' + 'a'.repeat(300) + '.uz']) expect((await hand(1, bad)).status).toBe(400);
        expect((await hand(1, 'https://ok.uz', 'x'.repeat(501))).status).toBe(400);
        expect(fake.s.subs).toHaveLength(0);
    });
    test('members who are not admins and strangers cannot hand in', async () => {
        expect((await hand(21)).status).toBe(403);
        expect((await hand(5)).status).toBe(403);
    });
    test('after the end nothing can be handed in; an unknown battle is 404', async () => {
        endNow();
        expect((await hand(1)).status).toBe(409);
        expect((await post('/999/submit', 1, { link: 'https://a.uz' })).status).toBe(404);
    });
    test('opponents cannot see your link until the battle is finished; everybody sees who handed in', async () => {
        await hand(1, 'https://github.com/alfa/loyiha');
        const forBeta = (await get('', 2)).body.battles[0];
        const alfa = forBeta.teams.find((t) => t.name === 'Alfa'); const beta = forBeta.teams.find((t) => t.name === 'Beta');
        expect(alfa.submitted).toBe(true); expect(alfa.submission).toBeUndefined();
        expect(beta.submitted).toBe(false);
        expect(forBeta.can_submit).toBe(true);
        expect((await get('', 21)).body.battles[0].can_submit).toBe(false);
        expect((await get('', 1)).body.battles[0].teams.find((t) => t.name === 'Alfa').submission.link).toBe('https://github.com/alfa/loyiha');
    });
});

describe('the judge', () => {
    beforeEach(async () => { await hand(1, 'https://github.com/alfa/loyiha', 'Alfa ishi'); await hand(2, 'https://github.com/beta/loyiha'); });
    test('a battle waits for the judge once the time is up, and the players are told', async () => {
        expect((await adminGet()).body.battles).toEqual([]);        // still running
        fake.s.notices.length = 0; endNow();
        await get('', 21);
        expect(fake.s.battles[0].status).toBe('judging');
        expect(fake.s.notices.filter((n) => n.title.startsWith('Vaqt tugadi')).length).toBe(6);
        expect((await get('', 21)).body.battles[0].status).toBe('judging');
    });
    test('only platform admins use the judge pages', async () => {
        endNow();
        expect((await adminGet('student')).status).toBe(403);
        expect((await adminPost(`/${id}/score`, { team_id: A, score: 50 }, 'teacher')).status).toBe(403);
        expect((await request(app).get('/api/admin/battles')).status).toBe(401);
    });
    test('the judge sees the handed-in work and scores it; scores are whole numbers from 0 to 100', async () => {
        endNow();
        const list = (await adminGet()).body;
        expect(list.battles).toHaveLength(1);
        expect(list.battles[0].teams.find((t) => t.name === 'Alfa')).toMatchObject({ submission: { link: 'https://github.com/alfa/loyiha', note: 'Alfa ishi' }, score: null });
        expect((await adminPost(`/${id}/score`, { team_id: A, score: 101 })).status).toBe(400);
        expect((await adminPost(`/${id}/score`, { team_id: A, score: 7.5 })).status).toBe(400);
        expect((await adminPost(`/${id}/score`, { team_id: A, score: -1 })).status).toBe(400);
        expect((await adminPost(`/${id}/score`, { team_id: A, score: 80, comment: 'Yaxshi dizayn' })).status).toBe(200);
        expect((await adminPost(`/${id}/score`, { team_id: A, score: 85 })).status).toBe(200);   // a score can be corrected
        expect((await adminGet()).body.battles[0].teams.find((t) => t.name === 'Alfa').score).toBe(85);
    });
    test('scoring works only while the battle waits for the judge, and only for teams that handed in', async () => {
        expect((await adminPost(`/${id}/score`, { team_id: A, score: 50 })).status).toBe(409);   // still running
        endNow(); await adminGet();
        const C = await team('Gamma', 3, [41, 42]);
        expect((await adminPost(`/${id}/score`, { team_id: C, score: 50 })).status).toBe(404);
        expect((await adminPost('/999/score', { team_id: A, score: 50 })).status).toBe(404);
    });
    test('the battle cannot be closed before every handed-in team has a score', async () => {
        endNow(); await adminGet();
        await adminPost(`/${id}/score`, { team_id: A, score: 90 });
        expect((await adminPost(`/${id}/finish`)).status).toBe(400);
        expect(fake.s.battles[0].status).toBe('judging');
    });
    test('closing: places by score, rating changes, trophy for the winner, once only', async () => {
        endNow(); await adminGet();
        await adminPost(`/${id}/score`, { team_id: A, score: 90 }); await adminPost(`/${id}/score`, { team_id: B, score: 70 });
        fake.s.notices.length = 0;
        expect((await adminPost(`/${id}/finish`)).body).toEqual({ status: 'finished' });
        const b = (await get('', 21)).body.battles[0];
        expect(b.status).toBe('finished');
        expect(b.teams.find((t) => t.name === 'Alfa')).toMatchObject({ result: { score: 90, place: 1 }, submission: { link: 'https://github.com/alfa/loyiha' } });
        expect(b.teams.find((t) => t.name === 'Beta').result.place).toBe(2);
        expect(fake.s.stats[A].rating).toBe(1016); expect(fake.s.stats[B].rating).toBe(984);
        expect(fake.s.stats[A].wins).toBe(1);
        expect(fake.s.notices.filter((n) => n.title.startsWith('Battle tugadi')).length).toBe(6);
        expect((await adminPost(`/${id}/finish`)).status).toBe(409);
        expect(fake.s.results).toHaveLength(2);
    });
    test('a team that handed in nothing scores 0 and loses to one that did', async () => {
        fake.s.subs = fake.s.subs.filter((x) => x.team_id === A);
        endNow(); await adminGet();
        await adminPost(`/${id}/score`, { team_id: A, score: 10 });
        expect((await adminPost(`/${id}/finish`)).status).toBe(200);
        const t = (await get('', 2)).body.battles[0].teams;
        expect(t.find((x) => x.name === 'Alfa').result.place).toBe(1);
        expect(t.find((x) => x.name === 'Beta').result).toMatchObject({ score: 0, place: 2 });
    });
    test('equal judge scores share first place', async () => {
        endNow(); await adminGet();
        await adminPost(`/${id}/score`, { team_id: A, score: 75 }); await adminPost(`/${id}/score`, { team_id: B, score: 75 });
        await adminPost(`/${id}/finish`);
        expect(fake.s.results.map((r) => r.place)).toEqual([1, 1]);
    });
});
