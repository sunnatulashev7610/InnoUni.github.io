// Seasonal tournament, step 3: playoffs, final, champion
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
async function play(battleId, rightTeams) {
    for (const t of fake.s.bteams.filter((x) => x.battle_id === battleId)) {
        const k = teams.indexOf(t.team_id) + 1;
        for (const q of fake.s.questions.filter((x) => x.battle_id === battleId)) {
            const r = await request(app).post(`/api/battles/${battleId}/answer`).set(as(100 + k)).send({ question_id: q.id, choice: rightTeams.includes(k) ? q.correct : (q.correct + 1) % 4 });
            expect(r.status).toBe(200);
        }
    }
}
const endAll = () => fake.s.battles.forEach((b) => { if (b.status === 'active') b.ends_at = new Date(Date.now() - 1000); });
// Plays every match of a stage; the lower team number always wins (winnerOf can return 0 for nobody)
async function finishStage(pick, winnerOf = (a, b) => Math.min(a, b)) {
    const t = await view();
    for (const m of t.matches.filter(pick)) {
        const a = teams.indexOf(m.team_a) + 1; const b = teams.indexOf(m.team_b) + 1; const w = winnerOf(a, b);
        await play(m.battle_id, w ? [w] : []);
    }
    endAll();
}
async function setup(n) {
    ai.isLive.mockReturnValue(true); ai.battleQuiz.mockReset(); ai.battleQuiz.mockResolvedValue({ questions: QUESTIONS, provider: 'test' });
    fake = createTeamsFake(); app.setDb(fake.db);
    id = (await adm('post', '', { title: 'Kuz kubogi', topic: 'Python', round_days: 3 })).body.id;
    teams = [];
    for (let k = 1; k <= n; k++) { teams.push(await team(k)); await request(app).post(`/api/tournaments/${id}/register`).set(as(100 + k)).send({ team_id: teams[k - 1] }); }
    expect((await adm('post', `/${id}/draw`)).status).toBe(200);
}
async function allGroups() {
    for (;;) {
        const t = await view();
        if (t.next_round === null) return;
        expect((await startRound()).status).toBe(200);
        await finishStage((m) => m.stage === 'group' && m.round_no === t.next_round);
    }
}

describe('4 teams: one group, the top two play the final', () => {
    beforeEach(() => setup(4));
    test('the playoffs wait for the groups; then the final starts with the top two', async () => {
        let r = await startRound(); expect(r.body.round).toBe(1);
        await finishStage((m) => m.stage === 'group' && m.round_no === 1);
        await allGroups();
        const before = await view();
        expect(before).toMatchObject({ groups_finished: true, next_stage: 'start', playoff_stage: null, champion: null });
        fake.s.notices.length = 0;
        r = await startRound();
        expect(r.body).toEqual({ stage: 'final', matches: 1 });
        expect(ai.battleQuiz).toHaveBeenLastCalledWith({ topic: 'Python', title: 'Kuz kubogi · Final' });
        const t = await view();
        expect(t.status).toBe('playoffs');
        const f = t.matches.find((m) => m.stage === 'final');
        expect([f.team_a, f.team_b].sort()).toEqual([teams[0], teams[1]].sort());      // table: 1 and 2
        expect(f).toMatchObject({ state: 'active', group_no: null });
        expect(fake.s.notices.filter((n) => n.title === 'Final boshlandi').length).toBeGreaterThan(0);
        expect((await startRound()).status).toBe(409);                                  // the final is running
    });
    test('the final decides the champion, and the champion gets the real battle trophy', async () => {
        await allGroups(); await startRound();
        await finishStage((m) => m.stage === 'final', (a, b) => Math.max(a, b));           // team 2 beats team 1
        const t = await view();
        expect(t.status).toBe('finished');
        expect(t.champion).toEqual({ team_id: teams[1], name: 'Jamoa 2' });
        expect(t.next_stage).toBeNull();
        expect((await startRound()).status).toBe(409);
        await view();
        const pub = await request(app).get(`/api/battles/teams/${teams[1]}/record`).set(as(101));
        expect(pub.status).toBe(200);
        expect(pub.body.trophies.some((x) => /Final/.test(x.title))).toBe(true);
    });
    test('a drawn final goes to the team that was better in the groups', async () => {
        await allGroups(); await startRound();
        await finishStage((m) => m.stage === 'final', () => 0);
        expect((await view()).champion.team_id).toBe(teams[0]);
    });
    test('the playoffs cannot start before every group match is finished', async () => {
        await startRound();
        expect((await startRound()).status).toBe(409);
    });
    test('a second click on the same stage does not make a second set of matches', async () => {
        await allGroups(); await startRound();
        expect((await startRound()).status).toBe(409);
        expect((await view()).matches.filter((m) => m.stage === 'final')).toHaveLength(1);
    });
    test('without the AI nothing is created', async () => {
        await allGroups(); ai.isLive.mockReturnValue(false);
        expect((await startRound()).status).toBe(503);
        expect((await view()).matches.filter((m) => m.stage === 'final')).toHaveLength(0);
    });
    test('a running tournament in the playoffs can be cancelled', async () => {
        await allGroups(); await startRound();
        expect((await adm('post', `/${id}/cancel`)).status).toBe(200);
        expect((await adm('get', '')).body.tournaments.find((x) => x.id === id)).toBeUndefined();
    });
});

describe('8 teams: two groups, semi-finals, final', () => {
    beforeEach(() => setup(8));
    test('A1-B2 and B1-A2, then the winners meet', async () => {
        await allGroups();
        const g = (await view()).groups;
        const top = (n, rank) => g[n].table.find((r) => r.rank === rank).team_id;
        expect((await startRound()).body).toEqual({ stage: 'semi', matches: 2 });
        let t = await view();
        const semis = t.matches.filter((m) => m.stage === 'semi');
        expect([semis[0].team_a, semis[0].team_b].sort()).toEqual([top(0, 1), top(1, 2)].sort());
        expect([semis[1].team_a, semis[1].team_b].sort()).toEqual([top(1, 1), top(0, 2)].sort());
        expect(t.next_stage).toBeNull();
        expect((await startRound()).status).toBe(409);                                 // semi-finals still running
        await finishStage((m) => m.stage === 'semi');
        t = await view();
        expect(t).toMatchObject({ stage_finished: true, next_stage: 'final' });
        expect((await startRound()).body).toEqual({ stage: 'final', matches: 1 });
        const winners = (await view()).matches.filter((m) => m.stage === 'semi').map((m) => m.winner);
        const f = (await view()).matches.find((m) => m.stage === 'final');
        expect([f.team_a, f.team_b].sort()).toEqual(winners.slice().sort());
        await finishStage((m) => m.stage === 'final');
        expect((await view()).champion).not.toBeNull();
    });
});

describe('16 teams: quarter-finals first', () => {
    beforeEach(() => setup(16));
    test('four quarter-finals, then two semi-finals, then the final', async () => {
        await allGroups();
        expect((await startRound()).body).toEqual({ stage: 'quarter', matches: 4 });
        await finishStage((m) => m.stage === 'quarter');
        expect((await startRound()).body).toEqual({ stage: 'semi', matches: 2 });
        await finishStage((m) => m.stage === 'semi');
        expect((await startRound()).body).toEqual({ stage: 'final', matches: 1 });
    });
});

describe('champion notice and Hall of Fame', () => {
    const hall = async () => (await request(app).get('/api/tournaments/champions').set(as(5))).body;
    beforeEach(() => setup(4));
    test('nothing in the Hall of Fame before a final is won', async () => {
        expect(await hall()).toEqual({ champions: [], teams: [] });
    });
    test('when the final ends everybody is told once; the champion team gets the congratulation', async () => {
        await allGroups(); await startRound();
        await finishStage((m) => m.stage === 'final', (a, b) => Math.max(a, b));
        fake.s.notices.length = 0;
        await view(); await view(); await view();                                          // seen many times, told once
        const champ = fake.s.notices.filter((n) => n.title === 'Tabriklaymiz! Kuz kubogi chempioni siz');
        expect(champ.map((n) => n.user_id)).toEqual(expect.arrayContaining([102, 220, 221]));
        expect(new Set(champ.map((n) => n.user_id)).size).toBe(champ.length);
        const others = fake.s.notices.filter((n) => n.title === 'Kuz kubogi yakunlandi');
        expect(others.length).toBeGreaterThan(0); expect(others[0].body).toBe('Chempion: Jamoa 2');
        expect(others.some((n) => n.user_id === 102)).toBe(false);
    });
    test('the champion is listed with the number of titles', async () => {
        await allGroups(); await startRound();
        await finishStage((m) => m.stage === 'final', (a, b) => Math.max(a, b));
        await view();
        const h = await hall();
        expect(h.champions).toHaveLength(1);
        expect(h.champions[0]).toMatchObject({ title: 'Kuz kubogi', topic: 'Python', team_id: teams[1], team_name: 'Jamoa 2' });
        expect(h.teams).toEqual([{ team_id: teams[1], name: 'Jamoa 2', titles: 1 }]);
    });
    test('needs a login', async () => {
        expect((await request(app).get('/api/tournaments/champions')).status).toBe(401);
    });
});
