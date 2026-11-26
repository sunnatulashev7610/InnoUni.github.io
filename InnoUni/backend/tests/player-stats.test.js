// Personal results in quiz battles: stats, MVP, badges, and the player leaderboard
process.env.JWT_SECRET = 'test-secret-test-secret-123';
jest.mock('../utils/aiProvider', () => ({ ...jest.requireActual('../utils/aiProvider'), isLive: jest.fn(() => true), battleQuiz: jest.fn() }));
const ai = require('../utils/aiProvider');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');
const { statsFromRows, shortName, badgesOf } = require('../utils/playerStats');

describe('maths', () => {
    test('short names', () => {
        expect(shortName('Ali Valiyev')).toBe('Ali V.'); expect(shortName('  ali   valiyev  qizi ')).toBe('ali V.');
        expect(shortName('Madonna')).toBe('Madonna'); expect(shortName('')).toBe('Foydalanuvchi'); expect(shortName(null)).toBe('Foydalanuvchi');
        expect(shortName("Ali O'ktam")).toBe('Ali O.');
    });
    const row = (battle_id, team_id, user_id, ok, n) => ({ battle_id, team_id, user_id, ok, n });
    test('answers, accuracy and battles are counted for the user only', () => {
        const rows = [row(1, 10, 1, 8, 10), row(1, 10, 2, 5, 10), row(2, 10, 1, 4, 10), row(2, 11, 9, 10, 10)];
        expect(statsFromRows(rows, 1)).toMatchObject({ answered: 20, correct: 12, accuracy: 60, battles: 2 });
    });
    test('MVP: the best of the team in a battle (ties share it); needs a teammate and at least one right answer', () => {
        const rows = [row(1, 10, 1, 8, 10), row(1, 10, 2, 5, 10), row(2, 10, 1, 4, 10), row(2, 10, 2, 4, 10), row(3, 10, 1, 9, 10), row(4, 10, 1, 0, 10), row(4, 10, 2, 0, 10), row(5, 10, 2, 9, 10), row(5, 10, 1, 3, 10)];
        // user 1: battle 1 yes, 2 tie yes, 3 alone no, 4 zero no, 5 no
        expect(statsFromRows(rows, 1).mvp).toBe(2);
        expect(statsFromRows(rows, 2).mvp).toBe(2);                   // battle 2 (tie) and battle 5
    });
    test('nobody: zeros and no badges', () => {
        expect(statsFromRows([], 1)).toEqual({ answered: 0, correct: 0, accuracy: 0, battles: 0, mvp: 0, badges: [] });
    });
    test('badges follow the numbers', () => {
        expect(badgesOf({ battles: 1, answered: 10, accuracy: 100, mvp: 0 }).map((b) => b.id)).toEqual(['first_battle']);
        expect(badgesOf({ battles: 5, answered: 50, accuracy: 80, mvp: 3 }).map((b) => b.id)).toEqual(['first_battle', 'veteran', 'sharp', 'mvp', 'star']);
        expect(badgesOf({ battles: 5, answered: 19, accuracy: 100, mvp: 0 }).map((b) => b.id)).not.toContain('sharp');
    });
});

describe('API', () => {
    const QUESTIONS = Array.from({ length: 10 }, (_, i) => ({ q: 'Savol ' + (i + 1), options: ['a', 'b', 'c', 'd'], answer: i % 4, explanation: 'x' }));
    let fake, A, B;
    const as = (uid) => ({ Authorization: `Bearer ${jwt.sign({ userId: uid, email: `u${uid}@example.com`, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
    const post = (path, who, body) => request(app).post('/api/battles' + path).set(as(who)).send(body || {});
    const get = (path, who) => request(app).get('/api/battles' + path).set(as(who));
    async function team(name, captain, members) {
        const t = (await request(app).post('/api/teams').set(as(captain)).send({ name, direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
        members.forEach((u) => fake.addMember(t, u, 'active')); return t;
    }
    // who answers how many questions right: {userId: rightCount}; everybody answers all 10
    async function battle(plan) {
        const id = (await post('', 1, { host_team_id: A, title: 'B' + fake.s.battles.length, topic: 'Mavzu', kind: 'quiz', duration_days: 1, opponent_team_ids: [B] })).body.id;
        await post(`/${id}/respond`, 4, { accept: true }); await post(`/${id}/start`, 1);
        const qs = fake.s.questions.filter((x) => x.battle_id === id);
        for (const [u, right] of Object.entries(plan)) for (let i = 0; i < qs.length; i++) await post(`/${id}/answer`, Number(u), { question_id: qs[i].id, choice: i < right ? qs[i].correct : (qs[i].correct + 1) % 4 });
        return id;
    }
    const finish = async (id) => { fake.s.battles.find((x) => x.id === id).ends_at = new Date(Date.now() - 1000); await get('', 1); };
    beforeEach(async () => {
        ai.isLive.mockReturnValue(true); ai.battleQuiz.mockReset(); ai.battleQuiz.mockResolvedValue({ questions: QUESTIONS, provider: 'test' });
        fake = createTeamsFake(); app.setDb(fake.db);
        fake.s.users[1] = 'Captain Alfa'; fake.s.users[2] = 'Ali Valiyev'; fake.s.users[3] = 'Vali Aliyev'; fake.s.users[4] = 'Dilnoza Karimova'; fake.s.users[5] = 'Sardor Nazarov';
        A = await team('Alfa', 1, [2, 3]); B = await team('Beta', 4, [5, 6]);
    });
    test('nothing is counted while the battle is running', async () => {
        await battle({ 1: 10, 2: 5 });
        expect((await get('/players/me', 1)).body).toMatchObject({ answered: 0, correct: 0, battles: 0, mvp: 0, badges: [] });
        expect((await get('/players/leaderboard', 1)).body.players).toEqual([]);
    });
    test('after the battle: personal numbers, MVP and badge', async () => {
        await finish(await battle({ 1: 10, 2: 5, 4: 7, 5: 7 }));
        const me = (await get('/players/me', 1)).body;
        expect(me).toMatchObject({ answered: 10, correct: 10, accuracy: 100, battles: 1, mvp: 1 });
        expect(me.badges.map((b) => b.id)).toEqual(['first_battle', 'mvp']);
        const ali = (await get('/players/me', 2)).body;
        expect(ali).toMatchObject({ correct: 5, accuracy: 50, mvp: 0 });
        const outsider = (await get('/players/me', 3)).body; expect(outsider.battles).toBe(0);     // member who did not answer
    });
    test('the leaderboard: best first, short names, "me" marked, accuracy and battles', async () => {
        await finish(await battle({ 1: 10, 2: 5, 4: 7, 5: 7 }));
        const { players } = (await get('/players/leaderboard', 2)).body;
        expect(players.map((p) => [p.name, p.correct])).toEqual([['Captain A.', 10], ['Dilnoza K.', 7], ['Sardor N.', 7], ['Ali V.', 5]]);
        expect(players.find((p) => p.name === 'Ali V.')).toMatchObject({ me: true, accuracy: 50, answered: 10, battles: 1 });
        expect(players.filter((p) => p.me)).toHaveLength(1);
        expect(JSON.stringify(players)).not.toMatch(/user_id|email/);
    });
    test('anonymous team members are not listed', async () => {
        await finish(await battle({ 1: 10, 2: 5 }));
        fake.s.members.find((m) => m.team_id === A && m.user_id === 2).anonymous = 1;
        const { players } = (await get('/players/leaderboard', 1)).body;
        expect(players.map((p) => p.name)).toEqual(['Captain A.']);
        expect((await get('/players/me', 2)).body.correct).toBe(5);                    // but they still see their own numbers
    });
    test('login is required', async () => {
        expect((await request(app).get('/api/battles/players/me')).status).toBe(401);
        expect((await request(app).get('/api/battles/players/leaderboard')).status).toBe(401);
    });
});
