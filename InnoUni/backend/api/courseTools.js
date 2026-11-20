// Tools around a course item: a student's private note and bookmark, and the materials (links) a teacher attaches.
// Notes are private to their author. Materials are written by the teacher or creator of the course and read by them and by enrolled students.
const express = require('express');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId, validateText, validateUrl } = require('../utils/validation');

const router = express.Router();
router.use(authenticateToken);

const MAX_NOTE = 2000;
const MAX_MATERIALS_PER_COURSE = 60;

// 'owner' (teacher or creator of the course), 'student' (enrolled) or null
async function roleIn(db, courseId, userId) {
    const [c] = await db.execute('SELECT id, teacher_id, creator_id FROM courses WHERE id = ?', [courseId]);
    if (!c.length) return null;
    if (c[0].teacher_id === userId || c[0].creator_id === userId) return 'owner';
    const [e] = await db.execute("SELECT 1 AS ok FROM course_enrollments WHERE course_id = ? AND user_id = ? AND status IN ('active', 'completed')", [courseId, userId]);
    return e.length ? 'student' : null;
}

// Everything a course page needs in one call: my notes and bookmarks, and the materials
router.get('/courses/:courseId', async (req, res) => {
    try {
        const courseId = parseId(req.params.courseId);
        if (!courseId) return res.status(400).json({ error: 'Invalid course id' });
        const role = await roleIn(req.db, courseId, req.user.userId);
        if (!role) return res.status(404).json({ error: 'Course not found' });
        const [notes] = await req.db.execute('SELECT item_id, body, bookmarked FROM item_notes WHERE user_id = ? AND course_id = ?', [req.user.userId, courseId]);
        const [materials] = await req.db.execute('SELECT id, item_id, title, url FROM course_materials WHERE course_id = ? ORDER BY id', [courseId]);
        res.json({
            notes: notes.map((n) => ({ item_id: n.item_id, body: n.body, bookmarked: Number(n.bookmarked) === 1 })),
            materials,
            can_manage: role === 'owner',
            limits: { maxNote: MAX_NOTE }
        });
    } catch (e) {
        console.error('Course tools read error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Save my note and/or bookmark of an item (an empty note without a bookmark removes the row)
router.put('/items/:itemId/note', async (req, res) => {
    try {
        const itemId = parseId(req.params.itemId);
        if (!itemId) return res.status(400).json({ error: 'Invalid item id' });
        const hasBody = Object.prototype.hasOwnProperty.call(req.body, 'body');
        const hasMark = Object.prototype.hasOwnProperty.call(req.body, 'bookmarked');
        if (!hasBody && !hasMark) return res.status(400).json({ error: 'Send body and/or bookmarked' });
        if (hasBody && (typeof req.body.body !== 'string' || req.body.body.length > MAX_NOTE)) return res.status(400).json({ error: `Note must be at most ${MAX_NOTE} characters` });
        if (hasMark && typeof req.body.bookmarked !== 'boolean') return res.status(400).json({ error: 'bookmarked must be true or false' });
        const [it] = await req.db.execute('SELECT id, course_id FROM course_content WHERE id = ?', [itemId]);
        if (!it.length || !(await roleIn(req.db, it[0].course_id, req.user.userId))) return res.status(404).json({ error: 'Item not found' });
        const userId = req.user.userId;
        const [cur] = await req.db.execute('SELECT body, bookmarked FROM item_notes WHERE user_id = ? AND item_id = ?', [userId, itemId]);
        const body = hasBody ? req.body.body.trim() : (cur.length ? cur[0].body : '');
        const bookmarked = hasMark ? req.body.bookmarked : (cur.length ? Number(cur[0].bookmarked) === 1 : false);
        if (!body && !bookmarked) {
            await req.db.execute('DELETE FROM item_notes WHERE user_id = ? AND item_id = ?', [userId, itemId]);
        } else {
            await req.db.execute(
                'INSERT INTO item_notes (user_id, item_id, course_id, body, bookmarked) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE body = VALUES(body), bookmarked = VALUES(bookmarked)',
                [userId, itemId, it[0].course_id, body, bookmarked ? 1 : 0]);
        }
        res.json({ item_id: itemId, body, bookmarked });
    } catch (e) {
        console.error('Note save error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Attach a link to a course (or to one item of it)
router.post('/courses/:courseId/materials', async (req, res) => {
    try {
        const courseId = parseId(req.params.courseId);
        if (!courseId) return res.status(400).json({ error: 'Invalid course id' });
        const title = validateText(req.body.title, { field: 'Title', maxLength: 200 });
        if (title.error || !title.value) return res.status(400).json({ error: title.error || 'Title is required' });
        const url = validateUrl(req.body.url);
        if (url.error) return res.status(400).json({ error: url.error });
        let itemId = null;
        if (req.body.item_id !== undefined && req.body.item_id !== null) {
            itemId = parseId(req.body.item_id);
            if (!itemId) return res.status(400).json({ error: 'Invalid item id' });
        }
        if ((await roleIn(req.db, courseId, req.user.userId)) !== 'owner') return res.status(404).json({ error: 'Course not found' });
        if (itemId) {
            const [it] = await req.db.execute('SELECT id FROM course_content WHERE id = ? AND course_id = ?', [itemId, courseId]);
            if (!it.length) return res.status(404).json({ error: 'Item not found in this course' });
        }
        const [n] = await req.db.execute('SELECT COUNT(*) AS n FROM course_materials WHERE course_id = ?', [courseId]);
        if (Number(n[0].n) >= MAX_MATERIALS_PER_COURSE) return res.status(400).json({ error: `A course can have at most ${MAX_MATERIALS_PER_COURSE} materials` });
        const [r] = await req.db.execute('INSERT INTO course_materials (course_id, item_id, title, url, added_by) VALUES (?, ?, ?, ?, ?)', [courseId, itemId, title.value, url.value, req.user.userId]);
        res.status(201).json({ id: r.insertId, item_id: itemId, title: title.value, url: url.value });
    } catch (e) {
        console.error('Material add error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/courses/:courseId/materials/:id', async (req, res) => {
    try {
        const courseId = parseId(req.params.courseId); const id = parseId(req.params.id);
        if (!courseId || !id) return res.status(400).json({ error: 'Invalid id' });
        if ((await roleIn(req.db, courseId, req.user.userId)) !== 'owner') return res.status(404).json({ error: 'Course not found' });
        const [r] = await req.db.execute('DELETE FROM course_materials WHERE id = ? AND course_id = ?', [id, courseId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Material not found' });
        res.json({ ok: true });
    } catch (e) {
        console.error('Material delete error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
