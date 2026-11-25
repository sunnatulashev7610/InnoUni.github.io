// Battle rating (ELO), leagues, badges and trophies
process.env.JWT_SECRET = 'test-secret-test-secret-123';
jest.mock('../utils/aiProvider', () => ({ ...jest.requireActual('../utils/aiProvider'), isLive: jest.fn(() => true), battleQuiz: jest.fn() }));
const ai = require('../utils/aiProvider');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');
const { eloChanges, leagueOf, badgesOf } = require('../utils/battleRating');

const QUESTIONS = Array.from({ length: 10 }, (_, i) => ({ q: 'Savol ' + (i + 1), options: ['a', 'b', 'c', 'd'], answer: i % 4, explanation: 'x' }));
let fake, A, B;
const as = (uid) => ({ Authorization: `Bearer ${jwt.sign({ userId: uid, email: `u${uid}@example.com`, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const post = (path, who, body) => request(app).post('/api/battles' + path).set(as(who)).send(body || {});
const get = (path, who) => request(app).get('/api/battles' + path).set(as(who));
async function team(name, captain, members) {
    const t = (await request(app).post('/api/teams').set(as(captain)).send({ name, direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
    members.forEach((u) => fake.addMember(t, u, 'active')); return t;
}
// One whole battle: `winner` team's captain answers everything right, the other's wrongly. Returns nothing; the battle is closed.
async function battle(host, opp, hostCaptain, oppCaptain, hostRight, oppRight) {
    const id = (await post('', hostCaptain, { host_team_id: host, title: 'B' + fake.s.battles.length, topic: 'Mavzu', kind: 'quiz', duration_days: 1, opponent_team_ids: [opp] })).body.id;
    await post(`/${id}/respond`, oppCaptain, { accept: true }); await post(`/${id}/start`, hostCaptain);
    for (const q of fake.s.questions.filter((x) => x.battle_id === id)) {
        await post(`/${id}/answer`, hostCaptain, { question_id: q.id, choice: hostRight ? q.correct : (q.correct + 1) % 4 });
        await post(`/${id}/answer`, oppCaptain, { question_id: q.id, choice: oppRight ? q.correct : (q.correct + 1) % 4 });
    }
    fake.s.battles.find((x) => x.id === id).ends_at = new Date(Date.now() - 1000);
    await get('', hostCaptain);
    return id;
}

describe('rating maths', () => {
    test('equal teams: the winner gains 16, the loser loses 16', () => {
        expect(eloChanges([{ team_id: 1, place: 1 }, { team_id: 2, place: 2 }], {})).toEqual({ 1: 16, 2: -16 });
    });
    test('a draw between equal teams changes nothing', () => {
        expect(eloChanges([{ team_id: 1, place: 1 }, { team_id: 2, place: 1 }], {})).toEqual({ 1: 0, 2: 0 });
    });
    test('beating a stronger team gives more than beating a weaker one', () => {
        const up = eloChanges([{ team_id: 1, place: 1 }, { team_id: 2, place: 2 }], { 1: 1000, 2: 1200 })[1];
        const down = eloChanges([{ team_id: 1, place: 1 }, { team_id: 2, place: 2 }], { 1: 1200, 2: 1000 })[1];
        expect(up).toBeGreaterThan(down);
    });
    test('leagues and badges follow the numbers', () => {
        expect([leagueOf(1000), leagueOf(1100), leagueOf(1250), leagueOf(1300)]).toEqual(['Bronza', 'Kumush', 'Oltin', 'Olmos']);
        expect(badgesOf({ rating: 1000, played: 0, wins: 0 })).toEqual([]);
        expect(badgesOf({ rating: 1210, played: 3, wins: 1 }).map((b) => b.id)).toEqual(['first_win', 'regular', 'gold']);
    });
});

describe('after a battle', () => {
    beforeEach(async () => {
        ai.isLive.mockReturnValue(true); ai.battleQuiz.mockReset(); ai.battleQuiz.mockResolvedValue({ questions: QUESTIONS, provider: 'test' });
        fake = createTeamsFake(); app.setDb(fake.db);
        for (let u = 11; u <= 60; u++) fake.s.users[u] = 'M' + u;
        A = await team('Alfa', 1, [21, 22]); B = await team('Beta', 2, [31, 32]);
    });
    test('winner goes up, loser goes down; a new team starts at 1000 in Bronza with no badges', async () => {
        expect((await get(`/teams/${A}/record`, 5)).body).toEqual({ rating: 1000, league: 'Bronza', played: 0, wins: 0, badges: [], trophies: [], recent: [], streak: 0 });
        const id = await battle(A, B, 1, 2, true, false);
        const a = (await get(`/teams/${A}/record`, 5)).body; const b = (await get(`/teams/${B}/record`, 5)).body;
        expect(a).toMatchObject({ rating: 1016, played: 1, wins: 1, league: 'Bronza' });
        expect(a.badges.map((x) => x.id)).toEqual(['first_win']);
        expect(a.trophies).toEqual([{ battle_id: id, title: expect.any(String), ends_at: expect.anything() }]);
        expect(b).toMatchObject({ rating: 984, played: 1, wins: 0, trophies: [] });
    });
    const lift = () => { const L = require('../utils/battleLimits').BATTLE_LIMITS; const old = L.maxPerPairPerWeek; L.maxPerPairPerWeek = 99; return () => { L.maxPerPairPerWeek = old; }; };
    test('recent games: newest first, opponent, scores and result; win streak counts from the newest', async () => {
        const undo = lift();
        const g1 = await battle(A, B, 1, 2, false, true);     // A loses
        const g2 = await battle(A, B, 1, 2, true, false);     // A wins
        const g3 = await battle(A, B, 1, 2, true, false);     // A wins
        const a = (await get(`/teams/${A}/record`, 5)).body; const b = (await get(`/teams/${B}/record`, 5)).body;
        expect(a.recent.map((r) => [r.battle_id, r.result, r.opponent])).toEqual([[g3, 'win', 'Beta'], [g2, 'win', 'Beta'], [g1, 'loss', 'Beta']]);
        expect(a.recent[0].score).toBeGreaterThan(a.recent[0].opponent_score);
        expect(a.streak).toBe(2);
        expect(b.recent.map((r) => r.result)).toEqual(['loss', 'loss', 'win']);
        expect(b.recent[2].opponent).toBe('Alfa');
        expect(b.streak).toBe(0);
        undo();
    });
    test('a draw is not a win and breaks the streak', async () => {
        await battle(A, B, 1, 2, true, true);
        const a = (await get(`/teams/${A}/record`, 5)).body;
        expect(a.recent[0].result).toBe('draw'); expect(a.streak).toBe(0);
    });
    test('only the last 5 games are listed', async () => {
        const undo = lift();
        for (let i = 0; i < 6; i++) await battle(A, B, 1, 2, true, false);
        const a = (await get(`/teams/${A}/record`, 5)).body;
        expect(a.recent).toHaveLength(5); expect(a.streak).toBe(5);
        undo();
    });
    test('the rating is changed once, however often the battle is looked at', async () => {
        await battle(A, B, 1, 2, true, false);
        await get('', 1); await get('', 2);
        expect((await get(`/teams/${A}/record`, 5)).body.rating).toBe(1016);
    });
    test('a battle nobody played gives no win and no trophy', async () => {
        const id = (await post('', 1, { host_team_id: A, title: 'Bosh', topic: 'M', kind: 'quiz', duration_days: 1, opponent_team_ids: [B] })).body.id;
        await post(`/${id}/respond`, 2, { accept: true }); await post(`/${id}/start`, 1);
        fake.s.battles[0].ends_at = new Date(Date.now() - 1000); await get('', 1);
        const a = (await get(`/teams/${A}/record`, 5)).body;
        expect(a).toMatchObject({ rating: 1000, wins: 0, played: 1, trophies: [] });
    });
    test('leaderboard is sorted by rating and shows only teams that played', async () => {
        await team('Gamma', 3, [41, 42]);
        await battle(A, B, 1, 2, true, false);
        const r = (await get('/leaderboard', 7)).body.teams;
        expect(r.map((t) => [t.name, t.rating])).toEqual([['Alfa', 1016], ['Beta', 984]]);
        expect(r[0].league).toBe('Bronza');
    });
    test('record: unknown team 404, bad id 400, no login 401', async () => {
        expect((await get('/teams/999/record', 5)).status).toBe(404);
        expect((await get('/teams/abc/record', 5)).status).toBe(400);
        expect((await request(app).get('/api/battles/leaderboard')).status).toBe(401);
    });
});
