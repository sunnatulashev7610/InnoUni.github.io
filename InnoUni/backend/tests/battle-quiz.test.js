// Quiz battles, step 2: questions made once by the AI, one answer each, hidden results until the time is up.
process.env.JWT_SECRET = 'test-secret-test-secret-123';
jest.mock('../utils/aiProvider', () => ({ ...jest.requireActual('../utils/aiProvider'), isLive: jest.fn(() => true), battleQuiz: jest.fn() }));
const ai = require('../utils/aiProvider');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');

// Alfa: admin 1 + members 21, 22 (+ 4).  Beta: admin 2 + members 31, 32.  Question i (0-based) has the right answer i % 4.
const QUESTIONS = Array.from({ length: 10 }, (_, i) => ({ q: 'Savol ' + (i + 1), options: ['a', 'b', 'c', 'd'], answer: i % 4, explanation: 'izoh ' + (i + 1) }));
let fake, A, B, id;
const as = (uid) => ({ Authorization: `Bearer ${jwt.sign({ userId: uid, email: `u${uid}@example.com`, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const post = (path, who, body) => request(app).post('/api/battles' + path).set(as(who)).send(body || {});
const get = (path, who) => request(app).get('/api/battles' + path).set(as(who));

async function team(name, captain, members) {
    const t = (await request(app).post('/api/teams').set(as(captain)).send({ name, direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
    members.forEach((u) => fake.addMember(t, u, 'active'));
    return t;
}
// A member answers every question: right ones when `right`, otherwise always a wrong choice
async function playAll(uid, right = true, only = 10) {
    const qs = fake.s.questions.filter((q) => q.battle_id === id).slice(0, only);
    for (const q of qs) await post(`/${id}/answer`, uid, { question_id: q.id, choice: right ? q.correct : (q.correct + 1) % 4 });
}
const endNow = () => { fake.s.battles[0].ends_at = new Date(Date.now() - 1000); };

beforeEach(async () => {
    ai.isLive.mockReturnValue(true);
    ai.battleQuiz.mockReset(); ai.battleQuiz.mockResolvedValue({ questions: QUESTIONS, provider: 'test' });
    fake = createTeamsFake(); app.setDb(fake.db);
    for (let u = 11; u <= 60; u++) fake.s.users[u] = 'M' + u;
    A = await team('Alfa', 1, [21, 22]); B = await team('Beta', 2, [31, 32]);
    id = (await post('', 1, { host_team_id: A, title: 'Python battle', topic: 'Python asoslari', kind: 'quiz', duration_days: 1, opponent_team_ids: [B] })).body.id;
    await post(`/${id}/respond`, 2, { accept: true });
});

describe('starting a quiz battle', () => {
    test('the AI makes 10 questions from the topic once, before the clock starts', async () => {
        const r = await post(`/${id}/start`, 1);
        expect(r.status).toBe(200);
        expect(ai.battleQuiz).toHaveBeenCalledTimes(1);
        expect(ai.battleQuiz).toHaveBeenCalledWith({ topic: 'Python asoslari', title: 'Python battle' });
        expect(fake.s.questions).toHaveLength(10);
        expect(fake.s.battles[0].status).toBe('active');
    });
    test('without the AI the battle does not start and stays waiting', async () => {
        ai.isLive.mockReturnValue(false);
        const r = await post(`/${id}/start`, 1);
        expect(r.status).toBe(503);
        expect(fake.s.battles[0].status).toBe('invited');
        expect(ai.battleQuiz).not.toHaveBeenCalled();
    });
    test('if the AI fails the host can try again; nothing half-made is left', async () => {
        ai.battleQuiz.mockRejectedValueOnce(new Error('boom'));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect((await post(`/${id}/start`, 1)).status).toBe(502);
        spy.mockRestore();
        expect(fake.s.battles[0].status).toBe('invited');
        expect(fake.s.questions).toHaveLength(0);
        expect((await post(`/${id}/start`, 1)).status).toBe(200);
    });
});

describe('playing', () => {
    beforeEach(async () => { await post(`/${id}/start`, 1); });
    test('players get the questions without the right answers; outsiders and non-quiz get 404', async () => {
        const r = await get(`/${id}/quiz`, 21);
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ status: 'active', total: 10, answered: 0, team_id: A });
        expect(r.body.questions[0]).toEqual({ id: expect.any(Number), position: 1, question: 'Savol 1', options: ['a', 'b', 'c', 'd'], my_choice: null });
        expect(JSON.stringify(r.body)).not.toMatch(/correct|izoh/);
        expect((await get(`/${id}/quiz`, 5)).status).toBe(404);
    });
    test('one answer per question, never changed; the answer is not graded out loud', async () => {
        const q = fake.s.questions[0];
        const ok = await post(`/${id}/answer`, 21, { question_id: q.id, choice: q.correct });
        expect(ok.body).toEqual({ saved: true, answered: 1 });
        expect((await post(`/${id}/answer`, 21, { question_id: q.id, choice: 3 })).status).toBe(409);
        expect(fake.s.answers).toHaveLength(1);
        expect((await get(`/${id}/quiz`, 21)).body.questions[0].my_choice).toBe(q.correct);
        expect((await get(`/${id}/quiz`, 22)).body.questions[0].my_choice).toBeNull();   // each person has their own answers
    });
    test('bad input and strangers are refused', async () => {
        const q = fake.s.questions[0];
        expect((await post(`/${id}/answer`, 21, { question_id: q.id, choice: 4 })).status).toBe(400);
        expect((await post(`/${id}/answer`, 21, { question_id: q.id, choice: 'a' })).status).toBe(400);
        expect((await post(`/${id}/answer`, 21, { question_id: 999, choice: 1 })).status).toBe(404);
        expect((await post(`/${id}/answer`, 5, { question_id: q.id, choice: 1 })).status).toBe(403);
        expect((await request(app).post(`/api/battles/${id}/answer`).send({ question_id: q.id, choice: 1 })).status).toBe(401);
    });
    test('after the time is up nobody can answer any more', async () => {
        endNow();
        const q = fake.s.questions[0];
        expect((await post(`/${id}/answer`, 21, { question_id: q.id, choice: 1 })).status).toBe(409);
    });
});

describe('the result', () => {
    beforeEach(async () => { await post(`/${id}/start`, 1); });
    test('score = right answers per member, over at least 3 members; the better team wins', async () => {
        await playAll(1); await playAll(21); await playAll(22, false);   // Alfa: 10 + 10 + 0 over 3 members
        await playAll(2); await playAll(31, false);                       // Beta: 10 + 0 over 3
        endNow();
        const list = (await get('', 1)).body.battles[0];
        expect(list.status).toBe('finished');
        const byName = Object.fromEntries(list.teams.map((t) => [t.name, t.result]));
        expect(byName.Alfa).toEqual({ score: 6.67, correct_total: 20, participants: 3, place: 1 });
        expect(byName.Beta).toEqual({ score: 3.33, correct_total: 10, participants: 2, place: 2 });
    });
    test('a single star player cannot carry a team: the sum is divided by 3 at least', async () => {
        await playAll(1);                          // Alfa: one player, 10 right -> 10 / 3
        await playAll(2); await playAll(31); await playAll(32);   // Beta: three players with 10 -> 10
        endNow();
        const t = (await get('', 2)).body.battles[0].teams;
        expect(t.find((x) => x.name === 'Alfa').result.place).toBe(2);
        expect(t.find((x) => x.name === 'Beta').result).toMatchObject({ score: 10, place: 1, participants: 3 });
    });
    test('equal results share the place', async () => {
        await playAll(1); await playAll(2);
        endNow();
        const t = (await get('', 1)).body.battles[0].teams;
        expect(t.map((x) => x.result.place)).toEqual([1, 1]);
    });
    test('it is closed once: members are told once, repeated looks change nothing', async () => {
        await playAll(1);
        endNow();
        fake.s.notices.length = 0;
        await get('', 1); await get('', 2); await get(`/${id}`, 2);
        expect(fake.s.results).toHaveLength(2);
        const told = fake.s.notices.filter((n) => n.title.startsWith('Battle tugadi'));
        expect(new Set(told.map((n) => n.user_id)).size).toBe(told.length);
        expect(told.map((n) => n.user_id)).toEqual(expect.arrayContaining([1, 2, 21, 31]));
        expect(told).toHaveLength(6);   // Alfa 1, 21, 22 and Beta 2, 31, 32
    });
    test('after the end the right answers and explanations are shown', async () => {
        await playAll(21);
        endNow();
        const r = await get(`/${id}/quiz`, 21);
        expect(r.body.status).toBe('finished');
        expect(r.body.questions[0]).toMatchObject({ correct: 0, explanation: 'izoh 1', my_choice: 0 });
        expect((await post(`/${id}/answer`, 22, { question_id: fake.s.questions[0].id, choice: 0 })).status).toBe(409);
    });
});
