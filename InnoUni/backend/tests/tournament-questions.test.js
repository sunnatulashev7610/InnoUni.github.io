// The admin writes the questions for a tournament stage (no AI needed)
process.env.JWT_SECRET = 'test-secret-test-secret-123';
jest.mock('../utils/aiProvider', () => ({ ...jest.requireActual('../utils/aiProvider'), isLive: jest.fn(() => true), battleQuiz: jest.fn() }));
const ai = require('../utils/aiProvider');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');
const { cleanQuestions } = require('../utils/tournamentQuestions');

const mk = (i, extra = {}) => Object.assign({ q: `Savol ${i}?`, options: ['a' + i, 'b' + i, 'c' + i, 'd' + i], answer: i % 4, explanation: 'Izoh ' + i }, extra);
const list = (n) => Array.from({ length: n }, (_, i) => mk(i + 1));
const AI_QS = Array.from({ length: 10 }, (_, i) => ({ q: 'AI ' + (i + 1), options: ['a', 'b', 'c', 'd'], answer: 0, explanation: 'x' }));

describe('cleanQuestions', () => {
    test('good questions are trimmed and kept; an empty list means "use the AI"', () => {
        const r = cleanQuestions([mk(1, { q: '  Savol?  ' }), mk(2), mk(3)]);
        expect(r.questions[0].q).toBe('Savol?'); expect(r.questions).toHaveLength(3);
        expect(cleanQuestions([])).toEqual({ questions: [] });
    });
    test.each([
        ['not a list', 'x', /list/],
        ['too few', list(2), /3 to 20/],
        ['too many', list(21), /3 to 20/],
        ['empty text', [mk(1, { q: ' ' }), mk(2), mk(3)], /Question 1: the question text is empty/],
        ['3 options', [mk(1), mk(2, { options: ['a', 'b', 'c'] }), mk(3)], /Question 2: it needs exactly 4/],
        ['blank option', [mk(1), mk(2), mk(3, { options: ['a', '', 'c', 'd'] })], /Question 3/],
        ['same options', [mk(1, { options: ['a', 'A', 'c', 'd'] }), mk(2), mk(3)], /must be different/],
        ['no correct option', [mk(1, { answer: 4 }), mk(2), mk(3)], /correct option/],
        ['answer as text', [mk(1, { answer: '1' }), mk(2), mk(3)], /correct option/],
        ['long question', [mk(1, { q: 'x'.repeat(401) }), mk(2), mk(3)], /too long/]
    ])('%s is refused', (_n, input, msg) => { expect(cleanQuestions(input).error).toMatch(msg); });
});

describe('admin API', () => {
    let fake, id;
    const as = (uid, role = 'admin') => ({ Authorization: `Bearer ${jwt.sign({ userId: uid, email: `u${uid}@example.com`, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
    const adm = (m, path, body) => request(app)[m]('/api/admin/tournaments' + path).set(as(99)).send(body || {});
    beforeEach(async () => {
        ai.isLive.mockReturnValue(true); ai.battleQuiz.mockReset(); ai.battleQuiz.mockResolvedValue({ questions: AI_QS, provider: 'test' });
        fake = createTeamsFake(); app.setDb(fake.db);
        id = (await adm('post', '', { title: 'Kuz kubogi', topic: 'Python', round_days: 3 })).body.id;
    });
    test('save, read back, replace and clear the questions of one stage', async () => {
        expect((await adm('put', `/${id}/questions/r1`, { questions: list(5) })).body).toEqual({ slot: 'r1', count: 5 });
        let g = (await adm('get', `/${id}/questions`)).body;
        expect(g.slots.r1).toHaveLength(5); expect(g.slots.r1[0]).toEqual(mk(1)); expect(g.slots.r2).toBeUndefined();
        expect(g.all_slots).toContain('final');
        await adm('put', `/${id}/questions/r1`, { questions: list(3) });
        expect((await adm('get', `/${id}/questions`)).body.slots.r1).toHaveLength(3);
        await adm('put', `/${id}/questions/r1`, { questions: [] });
        expect((await adm('get', `/${id}/questions`)).body.slots.r1).toBeUndefined();
    });
    test('bad input: unknown stage 400, bad question 400, unknown tournament 404, no admin 403, no login 401', async () => {
        expect((await adm('put', `/${id}/questions/r99`, { questions: list(3) })).status).toBe(400);
        const bad = await adm('put', `/${id}/questions/r1`, { questions: list(2) }); expect(bad.status).toBe(400); expect(bad.body.error).toMatch(/3 to 20/);
        expect((await adm('put', '/999/questions/r1', { questions: list(3) })).status).toBe(404);
        expect((await request(app).get(`/api/admin/tournaments/${id}/questions`).set(as(5, 'student'))).status).toBe(403);
        expect((await request(app).get(`/api/admin/tournaments/${id}/questions`)).status).toBe(401);
    });
    test('a cancelled tournament cannot be edited', async () => {
        await adm('post', `/${id}/cancel`);
        expect((await adm('put', `/${id}/questions/r1`, { questions: list(3) })).status).toBe(409);
    });
});

describe('questions are used when a stage starts', () => {
    let fake, id, teams;
    const as = (uid, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId: uid, email: `u${uid}@example.com`, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
    const adm = (m, path, body) => request(app)[m]('/api/admin/tournaments' + path).set(as(99, 'admin')).send(body || {});
    beforeEach(async () => {
        ai.isLive.mockReturnValue(true); ai.battleQuiz.mockReset(); ai.battleQuiz.mockResolvedValue({ questions: AI_QS, provider: 'test' });
        fake = createTeamsFake(); app.setDb(fake.db);
        id = (await adm('post', '', { title: 'Kuz kubogi', topic: 'Python', round_days: 3 })).body.id;
        teams = [];
        for (let k = 1; k <= 4; k++) {
            const t = (await request(app).post('/api/teams').set(as(100 + k)).send({ name: 'Jamoa ' + k, direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
            for (let i = 0; i < 2; i++) fake.addMember(t, 200 + k * 10 + i, 'active');
            teams.push(t); await request(app).post(`/api/tournaments/${id}/register`).set(as(100 + k)).send({ team_id: t });
        }
        await adm('post', `/${id}/draw`);
    });
    const battleQs = () => fake.s.questions.filter((q) => q.battle_id === fake.s.battles[0].id);
    test('round 1 uses the admin\'s questions exactly, the AI is not asked', async () => {
        await adm('put', `/${id}/questions/r1`, { questions: list(4) });
        const r = await adm('post', `/${id}/start-round`);
        expect(r.status).toBe(200);
        expect(ai.battleQuiz).not.toHaveBeenCalled();
        const qs = battleQs();
        expect(qs.map((q) => q.question)).toEqual(['Savol 1?', 'Savol 2?', 'Savol 3?', 'Savol 4?']);
        expect(qs[1].correct).toBe(2);
    });
    test('works with the AI switched off', async () => {
        ai.isLive.mockReturnValue(false);
        await adm('put', `/${id}/questions/r1`, { questions: list(3) });
        expect((await adm('post', `/${id}/start-round`)).status).toBe(200);
    });
    test('a stage without own questions still uses the AI; and then needs it', async () => {
        await adm('put', `/${id}/questions/r2`, { questions: list(3) });           // only round 2 has own questions
        expect((await adm('post', `/${id}/start-round`)).status).toBe(200);        // round 1 -> AI
        expect(ai.battleQuiz).toHaveBeenCalledTimes(1);
        fake.s.battles.forEach((b) => { b.ends_at = new Date(Date.now() - 1000); });
        for (const m of (await adm('get', '')).body.tournaments[0].matches) { /* nobody played: draws */ }
        ai.isLive.mockReturnValue(false);
        await request(app).get('/api/battles').set(as(101));                          // lazy finalize
        const r2 = await adm('post', `/${id}/start-round`);
        expect(r2.status).toBe(200);                                               // round 2 has own questions: no AI needed
        expect(ai.battleQuiz).toHaveBeenCalledTimes(1);
    });
    test('without own questions and without AI nothing starts', async () => {
        ai.isLive.mockReturnValue(false);
        expect((await adm('post', `/${id}/start-round`)).status).toBe(503);
    });
});
