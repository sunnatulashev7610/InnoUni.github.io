// Star ratings of a course. Anyone signed in may read them; only an enrolled student writes one
// (one per course, changeable). The course owner is told about a new rating.
const express = require('express');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');
const { roleIn } = require('../utils/courseAccess');
const { notify } = require('../utils/notify');

const router = express.Router();
router.use(authenticateToken);

const MAX_COMMENT = 500;
const SHOWN = 50;

// "Ali Karimov" -> "Ali K.": enough to tell people apart without printing full names to everybody
const shortName = (full) => {
    const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Foydalanuvchi';
    return parts.length > 1 ? `${parts[0]} ${parts[1][0].toUpperCase()}.` : parts[0];
};

async function summaryOf(db, courseId) {
    const [rows] = await db.execute('SELECT rating, COUNT(*) AS n FROM course_reviews WHERE course_id = ? GROUP BY rating', [courseId]);
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let count = 0; let sum = 0;
    for (const r of rows) { const n = Number(r.n); distribution[Number(r.rating)] = n; count += n; sum += n * Number(r.rating); }
    return { average: count ? Math.round((sum / count) * 10) / 10 : null, count, distribution };
}

router.get('/courses/:courseId', async (req, res) => {
    try {
        const courseId = parseId(req.params.courseId);
        if (!courseId) return res.status(400).json({ error: 'Invalid course id' });
        const [c] = await req.db.execute('SELECT id FROM courses WHERE id = ?', [courseId]);
        if (!c.length) return res.status(404).json({ error: 'Course not found' });
        const role = await roleIn(req.db, courseId, req.user.userId);
        const summary = await summaryOf(req.db, courseId);
        const [rows] = await req.db.execute(
            'SELECT r.id, r.user_id, r.rating, r.comment, r.created_at, u.full_name FROM course_reviews r JOIN users u ON u.id = r.user_id WHERE r.course_id = ? ORDER BY r.id DESC LIMIT ' + SHOWN,
            [courseId]
        );
        const [mine] = await req.db.execute('SELECT rating, comment FROM course_reviews WHERE course_id = ? AND user_id = ?', [courseId, req.user.userId]);
        res.json({
            summary,
            reviews: rows.map((r) => ({ id: r.id, author: shortName(r.full_name), rating: Number(r.rating), comment: r.comment, created_at: r.created_at, mine: r.user_id === req.user.userId })),
            mine: mine.length ? { rating: Number(mine[0].rating), comment: mine[0].comment } : null,
            can_review: role === 'student',
            limits: { maxComment: MAX_COMMENT }
        });
    } catch (e) {
        console.error('Reviews read error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/courses/:courseId', async (req, res) => {
    try {
        const courseId = parseId(req.params.courseId);
        if (!courseId) return res.status(400).json({ error: 'Invalid course id' });
        const rating = req.body && req.body.rating;
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5' });
        const comment = validateText(req.body.comment, { field: 'Comment', required: false, maxLength: MAX_COMMENT });
        if (comment.error) return res.status(400).json({ error: comment.error });
        const role = await roleIn(req.db, courseId, req.user.userId);
        if (role !== 'student') return res.status(403).json({ error: 'Only students enrolled in the course can rate it' });
        const [r] = await req.db.execute(
            'INSERT INTO course_reviews (course_id, user_id, rating, comment) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)',
            [courseId, req.user.userId, rating, comment.value]
        );
        // affectedRows is 1 for a new row and 2 for a changed one: tell the owner only about a new rating
        if (r.affectedRows === 1) {
            try {
                const [c] = await req.db.execute('SELECT title, teacher_id, creator_id FROM courses WHERE id = ?', [courseId]);
                const targets = new Map();
                if (c[0] && c[0].teacher_id) targets.set(c[0].teacher_id, 't-course-edit');
                if (c[0] && c[0].creator_id && !targets.has(c[0].creator_id)) targets.set(c[0].creator_id, 'course-detail');
                targets.delete(req.user.userId);
                for (const [o, page] of targets) await notify(req.db, o, { kind: 'review', title: 'Kursingizga baho qo\'yildi: ' + '★'.repeat(rating), body: comment.value ? comment.value.slice(0, 120) : (c[0].title || '').slice(0, 120), page, refId: courseId });
            } catch (e) { /* the rating is saved; the notice is only a convenience */ }
        }
        res.json({ summary: await summaryOf(req.db, courseId), mine: { rating, comment: comment.value } });
    } catch (e) {
        console.error('Review save error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/courses/:courseId', async (req, res) => {
    try {
        const courseId = parseId(req.params.courseId);
        if (!courseId) return res.status(400).json({ error: 'Invalid course id' });
        await req.db.execute('DELETE FROM course_reviews WHERE course_id = ? AND user_id = ?', [courseId, req.user.userId]);
        res.json({ summary: await summaryOf(req.db, courseId), mine: null });
    } catch (e) {
        console.error('Review delete error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
