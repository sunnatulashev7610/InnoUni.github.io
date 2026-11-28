// "Baraban": the server draws the member and the question and checks the answer
process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { createTeamsFake } = require('./helpers/teamsFake');

const qs = (n) => Array.from({ length: n }, (_, i) => ({ q: `Savol ${i + 1}?`, options: ['a' + i, 'b' + i, 'c' + i, 'd' + i], answer: i % 4, explanation: 'Izoh ' + i }));
let fake, T;
const as = (uid, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId: uid, email: `u${uid}@example.com`, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const w = (m, path, who, body) => request(app)[m]('/api/wheel' + path).set(as(who)).send(body || {});
const adm = (m, path, body, role = 'admin') => request(app)[m]('/api/admin' + path).set(as(99, role)).send(body || {});
const newSet = async (n = 5, title = 'Moddiy oqimlar') => (await adm('post', '/wheel-sets', { title, questions: qs(n) })).body.id;
async function open(n = 5) { const set = await newSet(n); return (await w('post', '/sessions', 1, { team_id: T, set_id: set })).body.id; }
const state = async (id, who = 1) => (await w('get', `/sessions/${id}`, who)).body;
const spin = async (id, who = 1) => (await w('post', `/sessions/${id}/spin`, who)).body;

beforeEach(async () => {
    fake = createTeamsFake(); app.setDb(fake.db);
    fake.s.users[1] = 'Kapitan'; fake.s.users[2] = 'Ali'; fake.s.users[3] = 'Vali'; fake.s.users[9] = 'Begona';
    T = (await request(app).post('/api/teams').set(as(1)).send({ name: 'Alfa', direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
    fake.addMember(T, 2, 'active'); fake.addMember(T, 3, 'active');
});

describe('admin question sets', () => {
    test('creates, lists and deletes; the list only shows how many questions', async () => {
        const id = await newSet(4, 'Logistika');
        const l = (await adm('get', '/wheel-sets')).body;
        expect(l.sets).toEqual([{ id, title: 'Logistika', count: 4 }]);
        expect((await adm('delete', `/wheel-sets/${id}`)).status).toBe(200);
        expect((await adm('get', '/wheel-sets')).body.sets).toHaveLength(0);
        expect((await adm('delete', `/wheel-sets/${id}`)).status).toBe(404);
    });
    test('bad sets are refused', async () => {
        expect((await adm('post', '/wheel-sets', { title: 'ab', questions: qs(4) })).status).toBe(400);
        expect((await adm('post', '/wheel-sets', { title: 'Yaxshi nom', questions: qs(2) })).status).toBe(400);
        expect((await adm('post', '/wheel-sets', { title: 'Yaxshi nom', questions: [] })).status).toBe(400);
        expect((await adm('post', '/wheel-sets', { title: 'Yaxshi nom', questions: 'x' })).status).toBe(400);
        expect((await adm('delete', '/wheel-sets/abc')).status).toBe(400);
    });
    test('a played set cannot be deleted; students cannot manage sets', async () => {
        const set = await newSet(5); await w('post', '/sessions', 1, { team_id: T, set_id: set });
        expect((await adm('delete', `/wheel-sets/${set}`)).status).toBe(409);
        expect((await adm('post', '/wheel-sets', { title: 'Yaxshi nom', questions: qs(4) }, 'student')).status).toBe(403);
        expect((await adm('get', '/wheel-sets', null, 'student')).status).toBe(403);
    });
    test('teams see the sets without any answers', async () => {
        await newSet(5, 'Logistika');
        const r = await w('get', '/sets', 1);
        expect(r.body.sets).toEqual([{ id: 1, title: 'Logistika', count: 5 }]);
        expect(JSON.stringify(r.body.sets)).not.toMatch(/answer|options/);
    });
});

describe('starting a game', () => {
    test('the team admin starts it; the others are told', async () => {
        const set = await newSet(5);
        const r = await w('post', '/sessions', 1, { team_id: T, set_id: set });
        expect(r.status).toBe(201);
        expect(fake.s.notices.filter((n) => n.title === 'Baraban boshlandi').map((n) => n.user_id).sort()).toEqual([2, 3]);
        const mine = (await w('get', '/mine', 2)).body;
        expect(mine.open).toHaveLength(1); expect(mine.open[0]).toMatchObject({ team_name: 'Alfa', title: 'Moddiy oqimlar' });
        expect((await w('get', '/mine', 9)).body.open).toHaveLength(0);
    });
    test('only the admin, only one game at a time, enough players and questions', async () => {
        const set = await newSet(5);
        expect((await w('post', '/sessions', 2, { team_id: T, set_id: set })).status).toBe(403);
        expect((await w('post', '/sessions', 1, { team_id: T, set_id: 999 })).status).toBe(404);
        expect((await w('post', '/sessions', 1, { team_id: 999, set_id: set })).status).toBe(404);
        expect((await w('post', '/sessions', 1, { team_id: 'x' })).status).toBe(400);
        expect((await w('post', '/sessions', 1, { team_id: T, set_id: set })).status).toBe(201);
        const again = await w('post', '/sessions', 1, { team_id: T, set_id: set });
        expect(again.status).toBe(409); expect(again.body.id).toBe(1);
        const small = await newSet(3);
        fake.addMember(T, 4, 'active'); fake.s.users[4] = 'Dilnoza'; fake.addMember(T, 5, 'active'); fake.s.users[5] = 'Zafar';
        await w('post', '/sessions/1/finish', 1);
        expect((await w('post', '/sessions', 1, { team_id: T, set_id: small })).status).toBe(409);      // 5 players, 3 questions
        const t2 = (await request(app).post('/api/teams').set(as(9)).send({ name: 'Yolgiz', direction: 'Dasturlash', sphere: 'Veb', goals: 'Maqsad' })).body.id;
        expect((await w('post', '/sessions', 9, { team_id: t2, set_id: set })).status).toBe(409);      // one active member
    });
    test('needs a login', async () => {
        expect((await request(app).get('/api/wheel/sets')).status).toBe(401);
    });
});

describe('playing', () => {
    test('only members see the game; the question shows no answer', async () => {
        const id = await open();
        expect((await w('get', `/sessions/${id}`, 9)).status).toBe(403);
        expect((await w('get', '/sessions/99', 1)).status).toBe(404);
        expect((await w('get', '/sessions/abc', 1)).status).toBe(400);
        const p = await spin(id);
        const s = await state(id, 3);
        expect(s.current.question.options).toHaveLength(4);
        expect(JSON.stringify(s)).not.toMatch(/"answer"/);
        expect(s.current.user_id).toBe(p.picked_user_id);
    });
    test('only the host spins, and not while somebody is answering', async () => {
        const id = await open();
        expect((await w('post', `/sessions/${id}/spin`, 2)).status).toBe(403);
        await spin(id);
        expect((await w('post', `/sessions/${id}/spin`, 1)).status).toBe(409);
    });
    test('only the chosen member answers; the server decides if it is right', async () => {
        const id = await open();
        const p = await spin(id); const cur = await state(id, p.picked_user_id);
        expect(cur.my_turn).toBe(true);
        const other = [1, 2, 3].find((u) => u !== p.picked_user_id);
        expect((await w('post', `/sessions/${id}/answer`, other, { choice: 0 })).status).toBe(403);
        expect((await w('post', `/sessions/${id}/answer`, p.picked_user_id, { choice: 7 })).status).toBe(400);
        expect((await w('post', `/sessions/${id}/answer`, p.picked_user_id, {})).status).toBe(400);
        const qi = fake.s.wsessions[0].current_q;
        const right = fake.s.wsets[0] && JSON.parse(fake.s.wsets[0].questions)[qi].answer;
        const r = await w('post', `/sessions/${id}/answer`, p.picked_user_id, { choice: right });
        expect(r.body).toMatchObject({ correct: true, timed_out: false, answer: right });
        const s = await state(id);
        expect(s.current).toBeNull(); expect(s.score).toBe(1); expect(s.last).toMatchObject({ correct: true, answer: right });
        expect(s.remaining.map((m) => m.user_id)).not.toContain(p.picked_user_id);
        expect((await w('post', `/sessions/${id}/answer`, p.picked_user_id, { choice: right })).status).toBe(403);
    });
    test('a wrong answer scores nothing', async () => {
        const id = await open();
        const p = await spin(id); const qi = fake.s.wsessions[0].current_q;
        const right = JSON.parse(fake.s.wsets[0].questions)[qi].answer;
        const r = await w('post', `/sessions/${id}/answer`, p.picked_user_id, { choice: (right + 1) % 4 });
        expect(r.body.correct).toBe(false); expect((await state(id)).score).toBe(0);
    });
    test('everybody plays once; the game ends by itself and a question never repeats', async () => {
        const id = await open(); const seenQ = new Set(); const seenU = new Set();
        for (let k = 0; k < 3; k++) {
            const p = await spin(id); expect(seenU.has(p.picked_user_id)).toBe(false); seenU.add(p.picked_user_id);
            const qi = fake.s.wsessions[0].current_q; expect(seenQ.has(qi)).toBe(false); seenQ.add(qi);
            const r = await w('post', `/sessions/${id}/answer`, p.picked_user_id, { choice: 0 });
            expect(r.body.finished).toBe(k === 2);
        }
        const s = await state(id); expect(s.status).toBe('finished'); expect(s.turns).toHaveLength(3);
        expect((await w('post', `/sessions/${id}/spin`, 1)).status).toBe(409);
        const mine = (await w('get', '/mine', 2)).body; expect(mine.open).toHaveLength(0); expect(mine.recent).toHaveLength(1);
    });
    test('the host can skip a silent member and finish early', async () => {
        const id = await open();
        expect((await w('post', `/sessions/${id}/skip`, 1)).status).toBe(409);
        const p = await spin(id);
        expect((await w('post', `/sessions/${id}/skip`, 2)).status === 403 || p.picked_user_id === 2).toBe(true);
        expect((await w('post', `/sessions/${id}/skip`, 1)).status).toBe(200);
        const s = await state(id); expect(s.turns).toEqual([{ user_id: p.picked_user_id, name: fake.s.users[p.picked_user_id], correct: false }]);
        expect((await w('post', `/sessions/${id}/finish`, 2)).status).toBe(403);
        expect((await w('post', `/sessions/${id}/finish`, 1)).status).toBe(200);
        expect((await state(id)).status).toBe('finished');
        expect((await w('post', `/sessions/${id}/finish`, 1)).status).toBe(409);
    });
    test('time runs out: a late answer scores nothing, and a new spin closes the silent turn', async () => {
        const id = await open();
        const p = await spin(id);
        fake.s.wsessions[0].asked_at = Date.now() - 80 * 1000;
        const s = await state(id); expect(s.current.seconds_left).toBe(0);
        const qi = fake.s.wsessions[0].current_q; const right = JSON.parse(fake.s.wsets[0].questions)[qi].answer;
        const r = await w('post', `/sessions/${id}/answer`, p.picked_user_id, { choice: right });
        expect(r.body).toMatchObject({ correct: false, timed_out: true });
        const p2 = await spin(id); fake.s.wsessions[0].asked_at = Date.now() - 70 * 1000;
        const p3 = await spin(id);
        expect(p3.picked_user_id).not.toBe(p2.picked_user_id);
        const st = await state(id); expect(st.turns).toHaveLength(2); expect(st.turns[1].correct).toBe(false);
    });
    test('the first answer inside the grace time still counts', async () => {
        const id = await open(); const p = await spin(id);
        fake.s.wsessions[0].asked_at = Date.now() - 63 * 1000;
        const qi = fake.s.wsessions[0].current_q; const right = JSON.parse(fake.s.wsets[0].questions)[qi].answer;
        expect((await w('post', `/sessions/${id}/answer`, p.picked_user_id, { choice: right })).body.correct).toBe(true);
    });
    test('the picked member is told', async () => {
        const id = await open(); const p = await spin(id);
        expect(fake.s.notices.some((n) => n.user_id === p.picked_user_id && n.title === 'Baraban sizni tanladi')).toBe(true);
    });
});

describe('Tezkor viktorina (members in turn, every question asked)', () => {
    const q = async (n = 5) => { const set = await newSet(n); return (await w('post', '/sessions', 1, { team_id: T, set_id: set, mode: 'quick' })).body.id; };
    const play = async (id, correct) => {
        const p = await spin(id); const qi = fake.s.wsessions[0].current_q; const right = JSON.parse(fake.s.wsets[0].questions)[qi].answer;
        const r = await w('post', `/sessions/${id}/answer`, p.picked_user_id, { choice: correct ? right : (right + 1) % 4 });
        return { p, r };
    };
    test('started in quick mode; fewer questions than members is fine; bad mode refused', async () => {
        const set = await newSet(3);
        expect((await w('post', '/sessions', 1, { team_id: T, set_id: set, mode: 'x' })).status).toBe(400);
        expect((await w('post', '/sessions', 1, { team_id: T, set_id: set, mode: 'quick' })).status).toBe(201);
        expect(fake.s.notices.some((n) => n.title === 'Tezkor viktorina boshlandi')).toBe(true);
        const s = await state(1); expect(s.mode).toBe('quick'); expect(s.answer_seconds).toBe(30);
        expect((await w('get', '/mine', 2)).body.open[0].mode).toBe('quick');
    });
    test('members answer in turn, a member can answer many times, and it ends after the last question', async () => {
        const id = await q(5); const order = [];
        for (let k = 0; k < 5; k++) { const { p, r } = await play(id, k % 2 === 0); order.push(p.picked_user_id); expect(r.body.finished).toBe(k === 4); }
        for (let k = 1; k < 5; k++) { const prev = order[k - 1]; const ids = [1, 2, 3]; expect(order[k]).toBe(ids[(ids.indexOf(prev) + 1) % 3]); }
        const s = await state(id);
        expect(s.status).toBe('finished'); expect(s.turns).toHaveLength(5); expect(s.score).toBe(3);
        expect(s.board.reduce((a, b) => a + b.answered, 0)).toBe(5); expect(s.board.reduce((a, b) => a + b.correct, 0)).toBe(3);
        expect(s.remaining).toHaveLength(3);
    });
    test('thirty seconds per answer', async () => {
        const id = await q(5); const p = await spin(id);
        fake.s.wsessions[0].asked_at = Date.now() - 31 * 1000;
        expect((await state(id)).current.seconds_left).toBe(0);
        fake.s.wsessions[0].asked_at = Date.now() - 20 * 1000;
        expect((await state(id)).current.seconds_left).toBe(10);
        const p2 = await spin(id); expect(p2).toBeDefined();                                                  // somebody is answering: refused below
        expect((await w('post', `/sessions/${id}/spin`, 1)).status).toBe(409);
        fake.s.wsessions[0].asked_at = Date.now() - 31 * 1000;
        const next = await spin(id); expect(next.picked_user_id).not.toBe(p.picked_user_id);
    });
    test('a double click cannot answer twice', async () => {
        const id = await q(5); const p = await spin(id);
        const [a, b] = await Promise.all([1, 2].map(() => w('post', `/sessions/${id}/answer`, p.picked_user_id, { choice: 0 })));
        expect([a.status, b.status].sort()).toEqual([200, 403]);
        expect((await state(id)).turns).toHaveLength(1);
    });
    test('the wheel game still ends when everybody has played', async () => {
        const id = await open(5); for (let k = 0; k < 3; k++) await play(id, true);
        expect((await state(id)).status).toBe('finished');
    });
});
