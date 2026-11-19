process.env.JWT_SECRET = 'test-secret-test-secret-123';
['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'AI_PROVIDER'].forEach((k) => delete process.env[k]);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { parseQuiz } = require('../utils/aiProvider');
const rules = require('../utils/lessonRules');

const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
let s;
// Course 1 (AI, created by user 9) has lessons 11, 12, 13; user 1 is enrolled. Course 2 is a normal course with lesson 21.
const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT role, blocked FROM users')) return [[{ role: 'student', blocked: 0 }]];
        if (q.startsWith('INSERT IGNORE INTO ai_lesson_usage')) { s.usage[p[0]] = s.usage[p[0]] || 0; return [{ affectedRows: 1 }]; }
        if (q.startsWith('UPDATE ai_lesson_usage SET used = used + 1')) { if (s.usage[p[0]] < p[1]) { s.usage[p[0]]++; return [{ affectedRows: 1 }]; } return [{ affectedRows: 0 }]; }
        if (q.startsWith('UPDATE ai_lesson_usage SET used = used - 1')) { if (s.usage[p[0]] > 0) s.usage[p[0]]--; return [{ affectedRows: 1 }]; }
        if (q.startsWith('SELECT used FROM ai_lesson_usage')) return [s.usage[p[0]] === undefined ? [] : [{ used: s.usage[p[0]] }]];
        if (q.includes('FROM course_content cc JOIN courses c')) { const l = s.lessons.find((x) => x.id === p[0]); return [l && l.ai ? [{ id: l.id, course_id: l.course, title: l.title, body: l.body, position: l.position, course_title: 'JS', creator_id: 9 }] : []]; }
        if (q.startsWith("SELECT 1 AS ok FROM course_enrollments")) return [s.enrolled.includes(p[0] + ':' + p[1]) ? [{ ok: 1 }] : []];
        if (q.startsWith("SELECT id, title, position FROM course_content WHERE course_id = ?")) return [s.lessons.filter((l) => l.course === p[0]).map(({ id, title, position }) => ({ id, title, position }))];
        if (q.startsWith('SELECT lesson_id, best_score, passed_at FROM lesson_progress')) return [s.prog.filter((r) => r.user === p[0] && r.course === p[1]).map((r) => ({ lesson_id: r.lesson, best_score: r.best, passed_at: r.passed }))];
        if (q.startsWith('SELECT id, title, creator_id FROM courses')) return [p[0] === 1 ? [{ id: 1, title: 'JS', creator_id: 9 }] : []];
        if (q.startsWith('SELECT plan, plan_provider')) { const r = s.prog.find((x) => x.user === p[0] && x.lesson === p[1]); return [r ? [{ plan: r.plan, plan_provider: 'demo', attempts: r.attempts, best_score: r.best, passed_at: r.passed }] : []]; }
        if (q.startsWith('INSERT IGNORE INTO lesson_progress')) { if (!s.prog.find((x) => x.user === p[0] && x.lesson === p[1])) s.prog.push({ user: p[0], lesson: p[1], course: p[2], plan: null, attempts: 0, best: null, passed: null }); return [{}]; }
        if (q.startsWith('UPDATE lesson_progress SET plan')) { const r = s.prog.find((x) => x.user === p[2] && x.lesson === p[3]); if (r && r.plan === null) r.plan = p[0]; return [{}]; }
        if (q.startsWith('UPDATE lesson_progress SET attempts')) { const r = s.prog.find((x) => x.user === p[2] && x.lesson === p[3]); r.attempts++; r.best = Math.max(r.best || 0, p[0]); if (p[1] === 1 && !r.passed) r.passed = new Date(); return [{}]; }
        if (q.startsWith('SELECT id, role, content, created_at FROM lesson_messages')) return [s.msgs.filter((m) => m.user === p[0] && m.lesson === p[1]).slice().reverse().map((m, i) => ({ id: i + 1, role: m.role, content: m.content }))];
        if (q.startsWith('SELECT role, content FROM lesson_messages')) return [s.msgs.filter((m) => m.user === p[0] && m.lesson === p[1]).slice().reverse().map(({ role, content }) => ({ role, content }))];
        if (q.startsWith("SELECT COUNT(*) AS n FROM lesson_messages")) return [[{ n: s.msgs.filter((m) => m.user === p[0] && m.lesson === p[1] && m.role === 'user').length }]];
        if (q.startsWith('INSERT INTO lesson_messages')) { s.msgs.push({ user: p[0], lesson: p[1], role: p[2], content: p[3] }); return [{}]; }
        if (q.startsWith('SELECT id, questions FROM lesson_quizzes WHERE user_id = ? AND lesson_id = ? AND submitted_at IS NULL')) return [s.quizzes.filter((x) => x.user === p[0] && x.lesson === p[1] && !x.done).slice(-1)];
        if (q.startsWith('INSERT INTO lesson_quizzes')) { s.quizzes.push({ id: s.quizzes.length + 1, user: p[0], lesson: p[1], questions: p[2], done: false }); return [{ insertId: s.quizzes.length }]; }
        if (q.startsWith('SELECT id, questions FROM lesson_quizzes WHERE id = ?')) return [s.quizzes.filter((x) => x.id === p[0] && x.user === p[1] && x.lesson === p[2] && !x.done)];
        if (q.startsWith('UPDATE lesson_quizzes SET submitted_at')) { const x = s.quizzes.find((y) => y.id === p[1] && !y.done); if (!x) return [{ affectedRows: 0 }]; x.done = true; return [{ affectedRows: 1 }]; }
        if (q.startsWith('UPDATE course_enrollments SET progress')) { s.enrollUpdates.push(p); return [{}]; }
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(() => {
    s = {
        usage: {}, enrolled: ['1:1'], prog: [], msgs: [], quizzes: [], enrollUpdates: [],
        lessons: [{ id: 11, course: 1, title: 'O\'zgaruvchilar', body: 'matn 1', position: 1, ai: true }, { id: 12, course: 1, title: 'Funksiyalar', body: 'matn 2', position: 2, ai: true }, { id: 13, course: 1, title: 'Massivlar', body: 'matn 3', position: 3, ai: true }, { id: 21, course: 2, title: 'Oddiy', body: 'x', position: 1, ai: false }]
    };
    ['AI_LESSON_DAILY_LIMIT', 'FEATURE_AI'].forEach((k) => delete process.env[k]);
});
const get = (url, who = as(1)) => request(app).get('/api/ai-lessons' + url).set(who);
const post = (url, body = {}, who = as(1)) => request(app).post('/api/ai-lessons' + url).set(who).send(body);
const talk = async (id, n = rules.MIN_CHAT_MESSAGES, who = as(1)) => { for (let i = 0; i < n; i++) await post(`/${id}/chat`, { message: 'savol ' + i }, who); };
// Pass a lesson: plan, talk, quiz, answer everything right (the stored quiz holds the right answers)
async function pass(id, wrong = 0, who = as(1), userId = 1) {
    await post(`/${id}/plan`, {}, who); await talk(id, rules.MIN_CHAT_MESSAGES, who);
    const q = await post(`/${id}/quiz`, {}, who);
    const stored = s.quizzes.filter((x) => x.user === userId && x.lesson === id).slice(-1)[0];
    const answers = JSON.parse(stored.questions).map((x, i) => (i < wrong ? (x.answer + 1) % 4 : x.answer));
    return { quiz: q.body.quiz, res: await post(`/${id}/quiz/submit`, { quiz_id: q.body.quiz.id, answers }, who) };
}

test('login is required', async () => {
    expect((await request(app).get('/api/ai-lessons/course/1')).status).toBe(401);
    expect((await request(app).post('/api/ai-lessons/11/plan')).status).toBe(401);
});

describe('who may use a lesson', () => {
    test('a stranger and a normal-course lesson are 404, the creator and an enrolled student get in', async () => {
        expect((await get('/11', as(5))).status).toBe(404);
        expect((await get('/21')).status).toBe(404);
        expect((await get('/11')).status).toBe(200);
        expect((await get('/11', as(9))).status).toBe(200);
        expect((await get('/course/1', as(5))).status).toBe(404);
    });
    test('bad ids are 400', async () => {
        expect((await get('/abc')).status).toBe(400);
        expect((await get('/course/abc')).status).toBe(400);
    });
});

describe('order: the next lesson is locked until the previous one is passed', () => {
    test('only the first lesson is open at the start', async () => {
        const r = await get('/course/1');
        expect(r.body.lessons.map((l) => l.status)).toEqual(['open', 'locked', 'locked']);
        expect(r.body).toMatchObject({ passed: 0, total: 3, rules: { PASS_SCORE: 8, QUIZ_QUESTIONS: 10 } });
    });
    test('a locked lesson cannot be read, taught, quizzed', async () => {
        const read = await get('/12'); expect(read.status).toBe(409); expect(read.body.code).toBe('LESSON_LOCKED');
        expect((await post('/12/plan')).status).toBe(409);
        expect((await post('/12/chat', { message: 'salom' })).status).toBe(409);
        expect((await post('/12/quiz')).status).toBe(409);
        expect((await post('/13/quiz/submit', { quiz_id: 1, answers: new Array(10).fill(0) })).status).toBe(409);
    });
    test('passing lesson 1 opens lesson 2 and not lesson 3', async () => {
        expect((await pass(11)).res.body.passed).toBe(true);
        expect((await get('/course/1')).body.lessons.map((l) => l.status)).toEqual(['passed', 'open', 'locked']);
        expect((await get('/12')).status).toBe(200);
        expect((await get('/13')).status).toBe(409);
    });
});

describe('step 1 and 2: plan, then the lesson as a chat', () => {
    test('the plan is made once and the same plan comes back (no second AI call)', async () => {
        const a = await post('/11/plan'); expect(a.status).toBe(200); expect(a.body.plan).toMatch(/reja/i);
        const used = s.usage[1];
        const b = await post('/11/plan'); expect(b.body.plan).toBe(a.body.plan);
        expect(s.usage[1]).toBe(used);
    });
    test('the chat needs the plan first', async () => {
        const r = await post('/11/chat', { message: 'salom' });
        expect(r.status).toBe(409); expect(r.body.code).toBe('PLAN_REQUIRED');
    });
    test('messages are stored and come back with the lesson; bad messages are 400', async () => {
        await post('/11/plan');
        expect((await post('/11/chat', { message: 'salom' })).status).toBe(200);
        expect((await post('/11/chat', { message: '   ' })).status).toBe(400);
        expect((await post('/11/chat', { message: 'x'.repeat(1001) })).status).toBe(400);
        const r = await get('/11');
        expect(r.body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
        expect(r.body.talked).toBe(1);
        expect(r.body.plan).toBeTruthy();
    });
    test('a failed AI gives the action back and stores nothing', async () => {
        process.env.GEMINI_API_KEY = 'g';
        const real = global.fetch; global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const r = await post('/11/plan');
        delete process.env.GEMINI_API_KEY; global.fetch = real; spy.mockRestore();
        expect(r.status).toBe(502); expect(s.usage[1]).toBe(0); expect(s.prog).toHaveLength(0);
    });
    test('the daily lesson limit stops the AI', async () => {
        process.env.AI_LESSON_DAILY_LIMIT = '1';
        expect((await post('/11/plan')).status).toBe(200);
        const r = await post('/11/chat', { message: 'salom' });
        expect(r.status).toBe(429);
    });
});

describe('step 3: the quiz', () => {
    test('the quiz needs the plan and a few chat messages first', async () => {
        expect((await post('/11/quiz')).body.code).toBe('PLAN_REQUIRED');
        await post('/11/plan');
        const r = await post('/11/quiz');
        expect(r.status).toBe(409); expect(r.body).toMatchObject({ code: 'TALK_FIRST', needed: 3, talked: 0 });
        await talk(11, 2);
        expect((await post('/11/quiz')).body.talked).toBe(2);
        await talk(11, 1);
        expect((await post('/11/quiz')).status).toBe(201);
    });
    test('10 questions with 4 options each, and the right answers are not sent', async () => {
        await post('/11/plan'); await talk(11);
        const r = await post('/11/quiz');
        expect(r.body.quiz.questions).toHaveLength(10);
        r.body.quiz.questions.forEach((q) => { expect(q.options).toHaveLength(4); expect(Object.keys(q).sort()).toEqual(['options', 'q']); });
        expect(JSON.stringify(r.body)).not.toMatch(/answer|explanation/);
        const again = await get('/11');
        expect(JSON.stringify(again.body.quiz)).not.toMatch(/answer|explanation/);
    });
    test('an unfinished quiz is handed out again, not remade (no extra AI cost)', async () => {
        await post('/11/plan'); await talk(11);
        const a = await post('/11/quiz'); const used = s.usage[1];
        const b = await post('/11/quiz');
        expect(b.body.quiz.id).toBe(a.body.quiz.id); expect(s.usage[1]).toBe(used);
    });
    test('10 of 10 and 8 of 10 pass; the progress of the enrollment moves', async () => {
        const a = await pass(11);
        expect(a.res.body).toMatchObject({ score: 10, passed: true, next_lesson_id: 12, course_finished: false });
        expect(s.enrollUpdates.at(-1)).toEqual([33.33, 'active', 1, 1]);
        const b = await pass(12, 2);
        expect(b.res.body).toMatchObject({ score: 8, passed: true, next_lesson_id: 13 });
    });
    test('7 of 10 does not pass: the next lesson stays locked and a new quiz can be taken', async () => {
        const a = await pass(11, 3);
        expect(a.res.body).toMatchObject({ score: 7, passed: false, next_lesson_id: null });
        expect(a.res.body.results.filter((r) => !r.correct)).toHaveLength(3);
        expect((await get('/12')).status).toBe(409);
        expect((await get('/11')).body).toMatchObject({ attempts: 1, best_score: 7, status: 'open' });
        const retry = await post('/11/quiz');
        expect(retry.status).toBe(201); expect(retry.body.quiz.id).not.toBe(a.quiz.id);
        const b = await pass(11);
        expect(b.res.body.passed).toBe(true);
        expect((await get('/12')).status).toBe(200);
    });
    test('the last lesson passed finishes the course', async () => {
        await pass(11); await pass(12);
        const r = await pass(13);
        expect(r.res.body).toMatchObject({ passed: true, course_finished: true, next_lesson_id: null });
        expect(s.enrollUpdates.at(-1)).toEqual([100, 'completed', 1, 1]);
    });
    test('a passed lesson has no new quiz; a quiz can be graded only once', async () => {
        const a = await pass(11);
        expect((await post('/11/quiz')).body.code).toBe('ALREADY_PASSED');
        const again = await post('/11/quiz/submit', { quiz_id: a.quiz.id, answers: new Array(10).fill(0) });
        expect(again.status).toBe(404);
    });
    test('bad answer lists are 400; a quiz of another user is 404', async () => {
        await post('/11/plan'); await talk(11);
        const q = await post('/11/quiz');
        expect((await post('/11/quiz/submit', { quiz_id: q.body.quiz.id, answers: [0, 1] })).status).toBe(400);
        expect((await post('/11/quiz/submit', { quiz_id: q.body.quiz.id, answers: new Array(10).fill(7) })).status).toBe(400);
        expect((await post('/11/quiz/submit', { answers: new Array(10).fill(0) })).status).toBe(400);
        s.enrolled.push('1:5');
        expect((await post('/11/quiz/submit', { quiz_id: q.body.quiz.id, answers: new Array(10).fill(0) }, as(9))).status).toBe(404);
    });
    test('unanswered questions (null) count as wrong', async () => {
        await post('/11/plan'); await talk(11);
        const q = await post('/11/quiz');
        const r = await post('/11/quiz/submit', { quiz_id: q.body.quiz.id, answers: new Array(10).fill(null) });
        expect(r.body).toMatchObject({ score: 0, passed: false });
    });
});

describe('parseQuiz', () => {
    const good = (n = 10) => JSON.stringify({ questions: Array.from({ length: n }, (_, i) => ({ q: 'Savol ' + i, options: ['a' + i, 'b' + i, 'c' + i, 'd' + i], answer: 2, explanation: 'izoh' })) });
    test('accepts exactly 10 good questions and keeps the right answer after shuffling', () => {
        const out = parseQuiz('Mana: ' + good());
        expect(out).toHaveLength(10);
        out.forEach((q, i) => { expect(q.options[q.answer]).toBe('c' + i); expect(new Set(q.options).size).toBe(4); });
    });
    test('rejects too few, bad answer index, duplicate options, no JSON', () => {
        expect(() => parseQuiz(good(9))).toThrow(/incomplete/);
        expect(() => parseQuiz(good(10).replace(/"answer":2/g, '"answer":9'))).toThrow(/incomplete/);
        expect(() => parseQuiz(good(10).replace(/"b(\d)"/g, '"a$1"'))).toThrow(/incomplete/);
        expect(() => parseQuiz('salom')).toThrow(/not JSON/);
    });
    test('extra questions are cut to 10', () => { expect(parseQuiz(good(12))).toHaveLength(10); });
});
