// Questions under a lesson. Enrolled students and the course owner (teacher or creator) see them all; a student asks, the owner answers.
// A student may delete their own question, the owner may delete any.
const express = require('express');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');
const { roleIn } = require('../utils/courseAccess');
const { notify } = require('../utils/notify');

const router = express.Router();
router.use(authenticateToken);

const MAX_QUESTION = 500;
const MAX_ANSWER = 2000;
const MAX_OPEN_PER_STUDENT = 20; // unanswered questions one student may have in one course
const PAGE = 100;

async function itemAccess(db, itemId, userId) {
    const [it] = await db.execute('SELECT id, course_id FROM course_content WHERE id = ?', [itemId]);
    if (!it.length) return null;
    const role = await roleIn(db, it[0].course_id, userId);
    return role ? { courseId: it[0].course_id, role } : null;
}

router.get('/items/:itemId', async (req, res) => {
    try {
        const itemId = parseId(req.params.itemId);
        if (!itemId) return res.status(400).json({ error: 'Invalid item id' });
        const acc = await itemAccess(req.db, itemId, req.user.userId);
        if (!acc) return res.status(404).json({ error: 'Item not found' });
        const [rows] = await req.db.execute(
            `SELECT q.id, q.user_id, q.body, q.answer, q.answered_at, q.created_at, u.full_name AS author
             FROM item_questions q JOIN users u ON u.id = q.user_id WHERE q.item_id = ? ORDER BY q.id DESC LIMIT ${PAGE}`, [itemId]);
        res.json({
            questions: rows.map((r) => ({ id: r.id, body: r.body, author: r.author, mine: r.user_id === req.user.userId, answer: r.answer || null, answered_at: r.answered_at, created_at: r.created_at })),
            can_answer: acc.role === 'owner',
            limits: { maxQuestion: MAX_QUESTION, maxAnswer: MAX_ANSWER }
        });
    } catch (e) {
        console.error('Q&A read error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/items/:itemId', async (req, res) => {
    try {
        const itemId = parseId(req.params.itemId);
        if (!itemId) return res.status(400).json({ error: 'Invalid item id' });
        const text = validateText(req.body.body, { field: 'Question', maxLength: MAX_QUESTION });
        if (text.error || !text.value) return res.status(400).json({ error: text.error || 'Question is required' });
        const acc = await itemAccess(req.db, itemId, req.user.userId);
        if (!acc) return res.status(404).json({ error: 'Item not found' });
        if (acc.role !== 'student') return res.status(403).json({ error: 'Only enrolled students ask questions' });
        const [n] = await req.db.execute('SELECT COUNT(*) AS n FROM item_questions WHERE user_id = ? AND course_id = ? AND answer IS NULL', [req.user.userId, acc.courseId]);
        if (Number(n[0].n) >= MAX_OPEN_PER_STUDENT) return res.status(429).json({ error: 'Too many unanswered questions. Wait for answers first.' });
        const [r] = await req.db.execute('INSERT INTO item_questions (course_id, item_id, user_id, body) VALUES (?, ?, ?, ?)', [acc.courseId, itemId, req.user.userId, text.value]);
        // tell the teacher (and the creator of an AI course)
        try {
            const [c] = await req.db.execute('SELECT teacher_id, creator_id FROM courses WHERE id = ?', [acc.courseId]);
            // a teacher opens the course in the editor, the creator of an AI course (a student) in the course page
            const targets = new Map();
            if (c[0] && c[0].teacher_id) targets.set(c[0].teacher_id, 't-course-edit');
            if (c[0] && c[0].creator_id && !targets.has(c[0].creator_id)) targets.set(c[0].creator_id, 'course-detail');
            targets.delete(req.user.userId);
            for (const [o, page] of targets) await notify(req.db, o, { kind: 'question', title: 'Darsda yangi savol', body: text.value.slice(0, 120), page, refId: acc.courseId });
        } catch (e) { /* the question is saved; the notice is only a convenience */ }
        res.status(201).json({ id: r.insertId, body: text.value, mine: true, answer: null });
    } catch (e) {
        console.error('Q&A ask error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

async function questionAccess(db, qid, userId) {
    const [q] = await db.execute('SELECT id, course_id, user_id FROM item_questions WHERE id = ?', [qid]);
    if (!q.length) return null;
    const role = await roleIn(db, q[0].course_id, userId);
    return role ? { q: q[0], role } : null;
}

// Owner answers (an empty answer clears it)
router.put('/questions/:id/answer', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        if (typeof req.body.answer !== 'string' || req.body.answer.length > MAX_ANSWER) return res.status(400).json({ error: `Answer must be at most ${MAX_ANSWER} characters` });
        const acc = await questionAccess(req.db, id, req.user.userId);
        if (!acc) return res.status(404).json({ error: 'Question not found' });
        if (acc.role !== 'owner') return res.status(403).json({ error: 'Only the teacher answers' });
        const answer = req.body.answer.trim();
        if (answer) {
            await req.db.execute('UPDATE item_questions SET answer = ?, answered_by = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ?', [answer, req.user.userId, id]);
            if (acc.q.user_id !== req.user.userId) await notify(req.db, acc.q.user_id, { kind: 'answer', title: 'Savolingizga javob berildi', body: answer.slice(0, 120), page: 'course-detail', refId: acc.q.course_id });
        }
        else await req.db.execute('UPDATE item_questions SET answer = NULL, answered_by = NULL, answered_at = NULL WHERE id = ?', [id]);
        res.json({ id, answer: answer || null });
    } catch (e) {
        console.error('Q&A answer error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/questions/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const acc = await questionAccess(req.db, id, req.user.userId);
        if (!acc) return res.status(404).json({ error: 'Question not found' });
        if (acc.role !== 'owner' && acc.q.user_id !== req.user.userId) return res.status(403).json({ error: 'You can delete only your own question' });
        await req.db.execute('DELETE FROM item_questions WHERE id = ?', [id]);
        res.json({ ok: true });
    } catch (e) {
        console.error('Q&A delete error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
