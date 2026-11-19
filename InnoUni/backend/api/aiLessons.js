// AI lessons: for every lesson of an AI course the AI first gives a plan, then teaches along the plan in a chat,
// then a quiz of 10 questions closes the lesson. The next lesson opens only after the quiz is passed (8 of 10).
// The right answers never leave the server until a quiz is submitted.
const express = require('express');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId } = require('../utils/validation');
const rules = require('../utils/lessonRules');
const { lessonPlan, lessonTalk, lessonQuiz, isLive } = require('../utils/aiProvider');

const router = express.Router();
router.use(authenticateToken);

const dailyLimit = () => Math.max(1, parseInt(process.env.AI_LESSON_DAILY_LIMIT, 10) || 40);
const busy = new Set(); // one AI call per user at a time, so the daily limit cannot be raced

async function usage(db, userId) {
    const [rows] = await db.execute('SELECT used FROM ai_lesson_usage WHERE user_id = ? AND day = CURDATE()', [userId]);
    const used = rows.length ? Number(rows[0].used) : 0;
    return { limit: dailyLimit(), used, remaining: Math.max(0, dailyLimit() - used) };
}

// The lesson, if it is a lesson of an AI course the user teaches (created) or is enrolled in
async function loadLesson(db, user, lessonId) {
    const [rows] = await db.execute(
        `SELECT cc.id, cc.course_id, cc.title, cc.body, cc.position, c.title AS course_title, c.creator_id
         FROM course_content cc JOIN courses c ON c.id = cc.course_id
         WHERE cc.id = ? AND cc.kind = 'lesson' AND c.is_ai = 1`, [lessonId]);
    if (!rows.length) return null;
    const lesson = rows[0];
    if (lesson.creator_id !== user.userId) {
        const [enr] = await db.execute("SELECT 1 AS ok FROM course_enrollments WHERE course_id = ? AND user_id = ? AND status = 'active'", [lesson.course_id, user.userId]);
        if (!enr.length) return null;
    }
    return lesson;
}

// Every lesson of the course in order, each marked passed / open (the first not passed) / locked
async function courseMap(db, courseId, userId) {
    const [lessons] = await db.execute("SELECT id, title, position FROM course_content WHERE course_id = ? AND kind = 'lesson' ORDER BY position, id", [courseId]);
    const [done] = await db.execute('SELECT lesson_id, best_score, passed_at FROM lesson_progress WHERE user_id = ? AND course_id = ?', [userId, courseId]);
    const byLesson = new Map(done.map((d) => [d.lesson_id, d]));
    let firstOpen = true;
    return lessons.map((l) => {
        const d = byLesson.get(l.id);
        const passed = Boolean(d && d.passed_at);
        let status = 'locked';
        if (passed) status = 'passed';
        else if (firstOpen) { status = 'open'; firstOpen = false; }
        return { id: l.id, title: l.title, position: l.position, status, score: d && d.best_score !== null && d.best_score !== undefined ? Number(d.best_score) : null };
    });
}

// A lesson the student may work on now: it exists, they may use it, and every lesson before it is passed
async function openLesson(req, res) {
    const lessonId = parseId(req.params.lessonId);
    if (!lessonId) { res.status(400).json({ error: 'Invalid lesson id' }); return null; }
    const lesson = await loadLesson(req.db, req.user, lessonId);
    if (!lesson) { res.status(404).json({ error: 'Lesson not found' }); return null; }
    const map = await courseMap(req.db, lesson.course_id, req.user.userId);
    const me = map.find((m) => m.id === lesson.id);
    if (!me || me.status === 'locked') { res.status(409).json({ error: 'Pass the previous lesson first', code: 'LESSON_LOCKED' }); return null; }
    lesson.map = map; lesson.status = me.status;
    return lesson;
}

const planOf = async (db, userId, lessonId) => {
    const [rows] = await db.execute('SELECT plan, plan_provider, attempts, best_score, passed_at FROM lesson_progress WHERE user_id = ? AND lesson_id = ?', [userId, lessonId]);
    return rows[0] || null;
};

const publicQuiz = (row) => ({ id: row.id, questions: JSON.parse(row.questions).map((q) => ({ q: q.q, options: q.options })) });

// The AI calls cost one of today's lesson actions: take it first (atomic), give it back if the AI fails
async function withBudget(req, res, work) {
    const userId = req.user.userId;
    let reserved = false; let locked = false;
    try {
        if (busy.has(userId)) return res.status(429).json({ error: 'Wait for the previous answer' });
        busy.add(userId); locked = true;
        const db = req.db;
        await db.execute('INSERT IGNORE INTO ai_lesson_usage (user_id, day, used) VALUES (?, CURDATE(), 0)', [userId]);
        const [taken] = await db.execute('UPDATE ai_lesson_usage SET used = used + 1 WHERE user_id = ? AND day = CURDATE() AND used < ?', [userId, dailyLimit()]);
        if (!taken.affectedRows) return res.status(429).json({ error: 'Daily limit reached', ...(await usage(db, userId)) });
        reserved = true;
        await work(() => { reserved = false; });
    } catch (e) {
        console.error('AI lesson error:', e.message);
        if (reserved) await req.db.execute('UPDATE ai_lesson_usage SET used = used - 1 WHERE user_id = ? AND day = CURDATE() AND used > 0', [userId]).catch(() => {});
        if (!res.headersSent) res.status(502).json({ error: 'The AI is not available right now, try again in a minute' });
    } finally {
        if (locked) busy.delete(userId);
    }
}

// The lessons of a course with their state: the list the student sees
router.get('/course/:courseId', async (req, res) => {
    try {
        const courseId = parseId(req.params.courseId);
        if (!courseId) return res.status(400).json({ error: 'Invalid course id' });
        const [c] = await req.db.execute('SELECT id, title, creator_id FROM courses WHERE id = ? AND is_ai = 1', [courseId]);
        if (!c.length) return res.status(404).json({ error: 'Course not found' });
        if (c[0].creator_id !== req.user.userId) {
            const [enr] = await req.db.execute("SELECT 1 AS ok FROM course_enrollments WHERE course_id = ? AND user_id = ? AND status = 'active'", [courseId, req.user.userId]);
            if (!enr.length) return res.status(404).json({ error: 'Course not found' });
        }
        const lessons = await courseMap(req.db, courseId, req.user.userId);
        res.json({ course: { id: c[0].id, title: c[0].title }, lessons, passed: lessons.filter((l) => l.status === 'passed').length, total: lessons.length, rules });
    } catch (e) {
        console.error('AI lessons list error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// One lesson with everything the page needs
router.get('/:lessonId', async (req, res) => {
    try {
        const lesson = await openLesson(req, res);
        if (!lesson) return;
        const db = req.db; const userId = req.user.userId;
        const prog = await planOf(db, userId, lesson.id);
        const [msgs] = await db.execute('SELECT id, role, content, created_at FROM lesson_messages WHERE user_id = ? AND lesson_id = ? ORDER BY id DESC LIMIT 60', [userId, lesson.id]);
        const [cnt] = await db.execute("SELECT COUNT(*) AS n FROM lesson_messages WHERE user_id = ? AND lesson_id = ? AND role = 'user'", [userId, lesson.id]);
        const [quiz] = await db.execute('SELECT id, questions FROM lesson_quizzes WHERE user_id = ? AND lesson_id = ? AND submitted_at IS NULL ORDER BY id DESC LIMIT 1', [userId, lesson.id]);
        const idx = lesson.map.findIndex((m) => m.id === lesson.id);
        res.json({
            lesson: { id: lesson.id, title: lesson.title, body: lesson.body, position: lesson.position, course_id: lesson.course_id, course_title: lesson.course_title },
            status: lesson.status,
            plan: prog && prog.plan ? prog.plan : null,
            messages: msgs.reverse(),
            talked: Number(cnt[0].n),
            quiz: quiz.length ? publicQuiz(quiz[0]) : null,
            attempts: prog ? Number(prog.attempts) : 0,
            best_score: prog && prog.best_score !== null && prog.best_score !== undefined ? Number(prog.best_score) : null,
            next_lesson_id: lesson.map[idx + 1] ? lesson.map[idx + 1].id : null,
            live: isLive(), rules, ...(await usage(db, userId))
        });
    } catch (e) {
        console.error('AI lesson read error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Step 1: the plan (made once; the same plan comes back afterwards)
router.post('/:lessonId/plan', async (req, res) => {
    try {
        const lesson = await openLesson(req, res);
        if (!lesson) return;
        const have = await planOf(req.db, req.user.userId, lesson.id);
        if (have && have.plan) return res.json({ plan: have.plan, ...(await usage(req.db, req.user.userId)) });
        await withBudget(req, res, async (spent) => {
            const out = await lessonPlan({ course: lesson.course_title, lesson });
            await req.db.execute('INSERT IGNORE INTO lesson_progress (user_id, lesson_id, course_id) VALUES (?, ?, ?)', [req.user.userId, lesson.id, lesson.course_id]);
            await req.db.execute('UPDATE lesson_progress SET plan = ?, plan_provider = ? WHERE user_id = ? AND lesson_id = ? AND plan IS NULL', [out.text, out.provider, req.user.userId, lesson.id]);
            spent();
            res.json({ plan: out.text, provider: out.provider, ...(await usage(req.db, req.user.userId)) });
        });
    } catch (e) {
        console.error('AI lesson plan error:', e);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
});

// Step 2: the lesson itself, a chat along the plan
router.post('/:lessonId/chat', async (req, res) => {
    try {
        const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
        if (!message || message.length > 1000) return res.status(400).json({ error: 'Message must be 1-1000 characters' });
        const lesson = await openLesson(req, res);
        if (!lesson) return;
        const userId = req.user.userId;
        const prog = await planOf(req.db, userId, lesson.id);
        if (!prog || !prog.plan) return res.status(409).json({ error: 'Get the lesson plan first', code: 'PLAN_REQUIRED' });
        await withBudget(req, res, async (spent) => {
            const [prev] = await req.db.execute('SELECT role, content FROM lesson_messages WHERE user_id = ? AND lesson_id = ? ORDER BY id DESC LIMIT 12', [userId, lesson.id]);
            const out = await lessonTalk({ course: lesson.course_title, lesson, plan: prog.plan, history: prev.reverse(), message });
            await req.db.execute('INSERT INTO lesson_messages (user_id, lesson_id, role, content, provider) VALUES (?, ?, ?, ?, ?)', [userId, lesson.id, 'user', message, null]);
            await req.db.execute('INSERT INTO lesson_messages (user_id, lesson_id, role, content, provider) VALUES (?, ?, ?, ?, ?)', [userId, lesson.id, 'assistant', out.text, out.provider]);
            spent();
            res.json({ reply: out.text, provider: out.provider, ...(await usage(req.db, userId)) });
        });
    } catch (e) {
        console.error('AI lesson chat error:', e);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
});

// Step 3a: a quiz of 10 questions (an unfinished quiz is handed out again, a new one is made only after a submitted one)
router.post('/:lessonId/quiz', async (req, res) => {
    try {
        const lesson = await openLesson(req, res);
        if (!lesson) return;
        const userId = req.user.userId;
        if (lesson.status === 'passed') return res.status(409).json({ error: 'This lesson is already passed', code: 'ALREADY_PASSED' });
        const prog = await planOf(req.db, userId, lesson.id);
        if (!prog || !prog.plan) return res.status(409).json({ error: 'Get the lesson plan first', code: 'PLAN_REQUIRED' });
        const [cnt] = await req.db.execute("SELECT COUNT(*) AS n FROM lesson_messages WHERE user_id = ? AND lesson_id = ? AND role = 'user'", [userId, lesson.id]);
        if (Number(cnt[0].n) < rules.MIN_CHAT_MESSAGES) return res.status(409).json({ error: 'Talk through the lesson with the AI first', code: 'TALK_FIRST', needed: rules.MIN_CHAT_MESSAGES, talked: Number(cnt[0].n) });
        const [open] = await req.db.execute('SELECT id, questions FROM lesson_quizzes WHERE user_id = ? AND lesson_id = ? AND submitted_at IS NULL ORDER BY id DESC LIMIT 1', [userId, lesson.id]);
        if (open.length) return res.json({ quiz: publicQuiz(open[0]), ...(await usage(req.db, userId)) });
        await withBudget(req, res, async (spent) => {
            const out = await lessonQuiz({ course: lesson.course_title, lesson });
            const [ins] = await req.db.execute('INSERT INTO lesson_quizzes (user_id, lesson_id, questions, provider) VALUES (?, ?, ?, ?)', [userId, lesson.id, JSON.stringify(out.questions), out.provider]);
            spent();
            res.status(201).json({ quiz: publicQuiz({ id: ins.insertId, questions: JSON.stringify(out.questions) }), provider: out.provider, ...(await usage(req.db, userId)) });
        });
    } catch (e) {
        console.error('AI lesson quiz error:', e);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
});

// Step 3b: the answers. Graded here, 8 right answers finish the lesson and open the next one
router.post('/:lessonId/quiz/submit', async (req, res) => {
    try {
        const lesson = await openLesson(req, res);
        if (!lesson) return;
        const userId = req.user.userId;
        const quizId = parseId(req.body.quiz_id);
        const answers = req.body.answers;
        if (!quizId || !Array.isArray(answers) || answers.length !== rules.QUIZ_QUESTIONS || !answers.every((a) => a === null || (Number.isInteger(a) && a >= 0 && a < rules.QUIZ_OPTIONS))) {
            return res.status(400).json({ error: `Send quiz_id and ${rules.QUIZ_QUESTIONS} answers (a number 0-${rules.QUIZ_OPTIONS - 1} or null)` });
        }
        const [rows] = await req.db.execute('SELECT id, questions FROM lesson_quizzes WHERE id = ? AND user_id = ? AND lesson_id = ? AND submitted_at IS NULL', [quizId, userId, lesson.id]);
        if (!rows.length) return res.status(404).json({ error: 'Quiz not found or already sent' });
        const questions = JSON.parse(rows[0].questions);
        const results = questions.map((q, i) => ({ correct: answers[i] === q.answer, answer: q.answer, chosen: answers[i], explanation: q.explanation || '' }));
        const score = results.filter((r) => r.correct).length;
        const passed = score >= rules.PASS_SCORE;
        // Closing the quiz is atomic: a quiz can be graded only once
        const [closed] = await req.db.execute('UPDATE lesson_quizzes SET submitted_at = NOW(), score = ? WHERE id = ? AND submitted_at IS NULL', [score, quizId]);
        if (!closed.affectedRows) return res.status(404).json({ error: 'Quiz not found or already sent' });
        await req.db.execute('UPDATE lesson_progress SET attempts = attempts + 1, best_score = GREATEST(COALESCE(best_score, 0), ?), passed_at = COALESCE(passed_at, IF(? = 1, NOW(), NULL)) WHERE user_id = ? AND lesson_id = ?', [score, passed ? 1 : 0, userId, lesson.id]);
        const idx = lesson.map.findIndex((m) => m.id === lesson.id);
        let finished = false;
        if (passed) {
            const total = lesson.map.length;
            const done = lesson.map.filter((m) => m.status === 'passed' || m.id === lesson.id).length;
            finished = done >= total;
            await req.db.execute("UPDATE course_enrollments SET progress = ?, status = ? WHERE course_id = ? AND user_id = ? AND status IN ('active', 'completed')", [Math.round((done * 10000) / total) / 100, finished ? 'completed' : 'active', lesson.course_id, userId]);
        }
        res.json({ score, total: rules.QUIZ_QUESTIONS, pass_score: rules.PASS_SCORE, passed, results, course_finished: finished, next_lesson_id: passed && lesson.map[idx + 1] ? lesson.map[idx + 1].id : null });
    } catch (e) {
        console.error('AI lesson submit error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
