// Seasonal tournament, step 2: one round at a time, one battle per match, group table
process.env.JWT_SECRET = 'test-secret-test-secret-123';
jest.mock('../utils/aiProvider', () => ({ ...jest.requireActual('../utils/aiProvider'), isLive: jest.fn(() => true), battleQuiz: jest.fn() }));
const ai = require('../utils/aiProvider');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');

const QUESTIONS = Array.from({ length: 10 }, (_, i) => ({ q: 'Savol ' + (i + 1), options: ['a', 'b', 'c', 'd'], answer: i % 4, explanation: 'x' }));
let fake, id, teams;
const as = (uid, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId: uid, email: `u${uid}@example.com`, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const adm = (m, path, body) => request(app)[m]('/api/admin/tournaments' + path).set(as(99, 'admin')).send(body || {});
const startRound = () => adm('post', `/${id}/start-round`);
const view = async () => (await adm('get', '')).body.tournaments.find((t) => t.id === id);

async function team(k) {
    const t = (await request(app).post('/api/teams').set(as(100 + k)).send({ name: 'Jamoa ' + k, direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
    for (let i = 0; i < 2; i++) fake.addMember(t, 200 + k * 10 + i, 'active');
    return t;
}
// Team k's admin (user 100+k) answers all of a battle's questions right (win) or wrong
async function play(battleId, rightTeams) {
    const bt = fake.s.bteams.filter((x) => x.battle_id === battleId);
    for (const t of bt) {
        const k = teams.indexOf(t.team_id) + 1;
        for (const q of fake.s.questions.filter((x) => x.battle_id === battleId)) {
            const r = await request(app).post(`/api/battles/${battleId}/answer`).set(as(100 + k)).send({ question_id: q.id, choice: rightTeams.includes(k) ? q.correct : (q.correct + 1) % 4 });
            expect(r.status).toBe(200);
        }
    }
}
const endAll = () => fake.s.battles.forEach((b) => { if (b.status === 'active') b.ends_at = new Date(Date.now() - 1000); });
// Plays and finishes the current round; lower team number always wins
async function finishRound(round, winnerOf = (a, b) => Math.min(a, b)) {
    const t = await view();
    for (const m of t.matches.filter((x) => x.round_no === round && x.stage === 'group')) {
        const a = teams.indexOf(m.team_a) + 1; const b = teams.indexOf(m.team_b) + 1; const w = winnerOf(a, b);
        await play(m.battle_id, w ? [w] : []);
    }
    endAll();
}

beforeEach(async () => {
    ai.isLive.mockReturnValue(true); ai.battleQuiz.mockReset(); ai.battleQuiz.mockResolvedValue({ questions: QUESTIONS, provider: 'test' });
    fake = createTeamsFake(); app.setDb(fake.db);
    id = (await adm('post', '', { title: 'Kuz kubogi', topic: 'Python', round_days: 3 })).body.id;
    teams = [];
    for (let k = 1; k <= 4; k++) { teams.push(await team(k)); await request(app).post(`/api/tournaments/${id}/register`).set(as(100 + k)).send({ team_id: teams[k - 1] }); }
    expect((await adm('post', `/${id}/draw`)).status).toBe(200);
});

describe('starting a round', () => {
    test('one AI call for the round; one battle per match; both teams in; same questions; running at once', async () => {
        fake.s.notices.length = 0;
        expect((await startRound()).body).toEqual({ round: 1, matches: 2 });
        expect(ai.battleQuiz).toHaveBeenCalledTimes(1);
        expect(ai.battleQuiz).toHaveBeenCalledWith({ topic: 'Python', title: 'Kuz kubogi · 1-tur' });
        expect(fake.s.battles).toHaveLength(2);
        fake.s.battles.forEach((b) => expect(b).toMatchObject({ status: 'active', kind: 'quiz', duration_days: 3 }));
        expect(fake.s.battles[0].title).toMatch(/^Kuz kubogi · 1-tur · A guruhi$/);
        expect(fake.s.questions).toHaveLength(20);
        const inRound = fake.s.bteams.map((x) => x.team_id).sort();
        expect(inRound).toEqual([...teams].sort());                 // each team plays exactly once in a round
        const t = await view();
        expect(t.matches.filter((m) => m.round_no === 1).every((m) => m.battle_id && m.state === 'active')).toBe(true);
        expect(t.matches.filter((m) => m.round_no === 2).every((m) => m.battle_id === null && m.state === 'waiting')).toBe(true);
        expect(t).toMatchObject({ next_round: 2, round_ready: false, rounds_total: 3, groups_finished: false });
        const told = fake.s.notices.filter((n) => n.title === '1-tur boshlandi');
        expect(told).toHaveLength(12); expect(new Set(told.map((n) => n.user_id)).size).toBe(12);
    });
    test('players find the match among their battles and can answer; the host admin cannot cancel or restart it', async () => {
        await startRound();
        const list = (await request(app).get('/api/battles').set(as(201 + 10))).body.battles;   // a plain member of team 1
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ status: 'active', kind: 'quiz', my_team_id: teams[0], can_respond: false });
        const bid = list[0].id;
        expect((await request(app).post(`/api/battles/${bid}/start`).set(as(101))).status).toBe(409);
        expect((await request(app).post(`/api/battles/${bid}/cancel`).set(as(101))).status).toBe(409);
    });
    test('without the AI nothing starts; if the AI fails nothing is left half-made and it can be repeated', async () => {
        ai.isLive.mockReturnValue(false);
        expect((await startRound()).status).toBe(503);
        ai.isLive.mockReturnValue(true);
        ai.battleQuiz.mockRejectedValueOnce(new Error('boom'));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect((await startRound()).status).toBe(502);
        spy.mockRestore();
        expect(fake.s.battles).toHaveLength(0);
        expect((await startRound()).status).toBe(200);
    });
    test('only platform admins; only after the draw', async () => {
        expect((await request(app).post(`/api/admin/tournaments/${id}/start-round`).set(as(101)).send({})).status).toBe(403);
        const fresh = (await adm('post', '', { title: 'Yangi', topic: 'JS' })).body.id;
        expect((await adm('post', `/${fresh}/start-round`)).status).toBe(409);
    });
    test('the next round waits until the whole previous round is finished; a second click starts nothing', async () => {
        await startRound();
        const r = await startRound();
        expect(r.status).toBe(409); expect(r.body.error).toContain('not finished');
        expect(fake.s.battles).toHaveLength(2);
        await finishRound(1);
        expect((await startRound()).body.round).toBe(2);
        expect(ai.battleQuiz).toHaveBeenCalledTimes(2);
    });
});

describe('the table', () => {
    test('after every round: points, difference and rank; nobody meets the same team twice', async () => {
        for (let r = 1; r <= 3; r++) { expect((await startRound()).body.round).toBe(r); await finishRound(r); }
        const t = await view();
        expect(t.groups_finished).toBe(true); expect(t.next_round).toBeNull();
        const seen = t.matches.map((m) => [m.team_a, m.team_b].sort().join('-'));
        expect(new Set(seen).size).toBe(6);
        const table = t.groups[0].table;
        expect(table.map((r) => r.team_id)).toEqual(teams);           // team 1 beat everybody, team 4 lost to everybody
        expect(table.map((r) => r.points)).toEqual([9, 6, 3, 0]);
        expect(table.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
        expect(table.map((r) => r.diff)).toEqual([9.99, 3.33, -3.33, -9.99]);
        expect(t.matches[0]).toMatchObject({ state: 'finished', score_a: expect.any(Number), score_b: expect.any(Number) });
        expect((await startRound()).status).toBe(409);                 // nothing left to start
    });
    test('a match nobody played is a 0:0 draw worth a point each', async () => {
        await startRound(); await finishRound(1, () => 0);
        const t = await view();
        expect(t.groups[0].table.every((r) => r.points === 1 && r.drawn === 1 && r.played === 1)).toBe(true);
    });
    test('while a match is running its score is not shown', async () => {
        await startRound();
        const t = await view();
        expect(t.matches[0]).toMatchObject({ state: 'active', score_a: null, score_b: null });
        expect(t.groups[0].table.every((r) => r.played === 0)).toBe(true);
    });
    test('rating changes with every finished match (they are real battles)', async () => {
        await startRound(); await finishRound(1); await view();
        expect(fake.s.stats[teams[0]].rating).toBeGreaterThan(1000);
        expect(fake.s.stats[teams[3]].rating).toBeLessThan(1000);
    });
});

test('cancelling stops the matches that are still running', async () => {
    await startRound();
    expect((await adm('post', `/${id}/cancel`)).status).toBe(200);
    expect(fake.s.battles.every((b) => b.status === 'cancelled')).toBe(true);
});
