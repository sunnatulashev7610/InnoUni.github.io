// A team captain can object to a finished battle's result; the admin answers
process.env.JWT_SECRET = 'test-secret-test-secret-123';
jest.mock('../utils/aiProvider', () => ({ ...jest.requireActual('../utils/aiProvider'), isLive: jest.fn(() => true), battleQuiz: jest.fn() }));
const ai = require('../utils/aiProvider');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');

const QUESTIONS = Array.from({ length: 10 }, (_, i) => ({ q: 'Savol ' + (i + 1), options: ['a', 'b', 'c', 'd'], answer: i % 4, explanation: 'x' }));
let fake, A, B, id;
const as = (uid, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId: uid, email: `u${uid}@example.com`, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const post = (path, who, body) => request(app).post('/api/battles' + path).set(as(who)).send(body || {});
const get = (path, who) => request(app).get('/api/battles' + path).set(as(who));
const appeal = (who, reason = 'Savol 3 noto\'g\'ri tuzilgan edi') => post(`/${id}/appeal`, who, { reason });
const adm = (m, path, body, role = 'admin') => request(app)[m]('/api/admin' + path).set(as(99, role)).send(body || {});
async function team(name, captain, members) {
    const t = (await request(app).post('/api/teams').set(as(captain)).send({ name, direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
    members.forEach((u) => fake.addMember(t, u, 'active')); return t;
}
const mine = async (who) => (await get('', who)).body.battles.find((b) => b.id === id);

beforeEach(async () => {
    ai.isLive.mockReturnValue(true); ai.battleQuiz.mockReset(); ai.battleQuiz.mockResolvedValue({ questions: QUESTIONS, provider: 'test' });
    fake = createTeamsFake(); app.setDb(fake.db);
    for (let u = 11; u <= 60; u++) fake.s.users[u] = 'M' + u;
    fake.s.users[1] = 'Kapitan A'; fake.s.users[2] = 'Kapitan B';
    A = await team('Alfa', 1, [21, 22]); B = await team('Beta', 2, [31, 32]);
    id = (await post('', 1, { host_team_id: A, title: 'Jang', topic: 'Mavzu', kind: 'quiz', duration_days: 1, opponent_team_ids: [B] })).body.id;
    await post(`/${id}/respond`, 2, { accept: true }); await post(`/${id}/start`, 1);
});
const finish = async (hoursAgo = 1) => {
    for (const q of fake.s.questions.filter((x) => x.battle_id === id)) {
        await post(`/${id}/answer`, 1, { question_id: q.id, choice: q.correct });
        await post(`/${id}/answer`, 2, { question_id: q.id, choice: (q.correct + 1) % 4 });
    }
    fake.s.battles.find((x) => x.id === id).ends_at = new Date(Date.now() - hoursAgo * 3600000);
    await get('', 1);
};

describe('sending an objection', () => {
    test('only after the battle is finished', async () => {
        const r = await appeal(2); expect(r.status).toBe(409);
    });
    test('the captain of a team in the battle can object once; the card shows it', async () => {
        await finish();
        expect((await mine(2)).can_appeal).toBe(true);
        const r = await appeal(2); expect(r.status).toBe(201); expect(r.body).toEqual({ sent: true });
        const card = await mine(2);
        expect(card.can_appeal).toBe(false); expect(card.appeal).toEqual({ status: 'open', note: '' });
        expect((await appeal(2)).status).toBe(409);
    });
    test('each team has its own objection', async () => {
        await finish();
        expect((await appeal(2)).status).toBe(201); expect((await appeal(1)).status).toBe(201);
    });
    test('a plain member, an outsider and a stranger cannot object', async () => {
        await finish();
        expect((await appeal(21)).status).toBe(403); expect((await appeal(55)).status).toBe(403);
        expect((await mine(21)).can_appeal).toBe(false);
    });
    test('the 48 hour window closes', async () => {
        await finish(49);
        expect((await mine(2)).can_appeal).toBe(false);
        expect((await appeal(2)).status).toBe(409);
    });
    test('the reason must be 10-500 characters', async () => {
        await finish();
        expect((await appeal(2, 'qisqa')).status).toBe(400);
        expect((await appeal(2, 'x'.repeat(501))).status).toBe(400);
        expect((await appeal(2, '   ')).status).toBe(400);
        expect((await post(`/${id}/appeal`, 2, {})).status).toBe(400);
    });
    test('unknown battle 404, bad id 400, no login 401', async () => {
        expect((await post('/999/appeal', 2, { reason: 'Yetarlicha uzun sabab' })).status).toBe(404);
        expect((await post('/abc/appeal', 2, { reason: 'Yetarlicha uzun sabab' })).status).toBe(400);
        expect((await request(app).post(`/api/battles/${id}/appeal`).send({ reason: 'Yetarlicha uzun sabab' })).status).toBe(401);
    });
});

describe('admin answers', () => {
    beforeEach(async () => { await finish(); await appeal(2); });
    test('lists open objections with battle, team and captain', async () => {
        const r = await adm('get', '/appeals');
        expect(r.status).toBe(200);
        expect(r.body.appeals).toHaveLength(1);
        expect(r.body.appeals[0]).toMatchObject({ battle_title: 'Jang', team_name: 'Beta', captain_name: 'Kapitan B', status: 'open' });
        expect((await adm('get', '/appeals?status=resolved')).body.appeals).toHaveLength(0);
    });
    test('accept: the captain is told and the card shows the answer', async () => {
        const r = await adm('post', '/appeals/1/resolve', { decision: 'accepted', note: 'Savol tekshirildi, haq ekansiz' });
        expect(r.status).toBe(200); expect(r.body).toEqual({ status: 'accepted' });
        expect(fake.s.notices.filter((n) => n.user_id === 2).pop().title).toBe("E'tirozingiz qabul qilindi");
        expect((await mine(2)).appeal).toEqual({ status: 'accepted', note: 'Savol tekshirildi, haq ekansiz' });
        expect((await adm('get', '/appeals')).body.appeals).toHaveLength(0);
        expect((await adm('get', '/appeals?status=resolved')).body.appeals).toHaveLength(1);
    });
    test('reject works and tells the captain', async () => {
        await adm('post', '/appeals/1/resolve', { decision: 'rejected', note: 'Natija to\'g\'ri' });
        expect(fake.s.notices.filter((n) => n.user_id === 2).pop().title).toBe("E'tirozingiz rad etildi");
    });
    test('bad decision, missing note, unknown id and second answer are refused', async () => {
        expect((await adm('post', '/appeals/1/resolve', { decision: 'maybe', note: 'x' })).status).toBe(400);
        expect((await adm('post', '/appeals/1/resolve', { decision: 'accepted' })).status).toBe(400);
        expect((await adm('post', '/appeals/1/resolve', { decision: 'accepted', note: 'x'.repeat(301) })).status).toBe(400);
        expect((await adm('post', '/appeals/77/resolve', { decision: 'accepted', note: 'ok' })).status).toBe(404);
        expect((await adm('post', '/appeals/abc/resolve', { decision: 'accepted', note: 'ok' })).status).toBe(400);
        expect((await adm('post', '/appeals/1/resolve', { decision: 'accepted', note: 'ok' })).status).toBe(200);
        expect((await adm('post', '/appeals/1/resolve', { decision: 'rejected', note: 'ok' })).status).toBe(409);
    });
    test('only the admin: 403 for a student, 401 without login', async () => {
        expect((await adm('get', '/appeals', null, 'student')).status).toBe(403);
        expect((await adm('post', '/appeals/1/resolve', { decision: 'accepted', note: 'ok' }, 'student')).status).toBe(403);
        expect((await request(app).get('/api/admin/appeals')).status).toBe(401);
    });
});
