// AI course creator: the user briefs the AI, gets a course. It stays private (only the creator sees it) until the creator makes it public.
// A public AI course is a normal course in the catalogue, credited to "Gather Edu" and the creator.
const express = require('express');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');
const { requireVerifiedEmail } = require('../utils/verified');
const { ensureCourseGroup } = require('../utils/courseGroups');
const { courseDraft } = require('../utils/aiProvider');

const router = express.Router();
router.use(authenticateToken);

const dailyLimit = () => Math.max(1, parseInt(process.env.AI_COURSE_DAILY_LIMIT, 10) || 3);
const LEVELS = ['boshlang\'ich', 'o\'rta', 'yuqori'];
const busy = new Set();

async function usage(db, userId) {
    const [rows] = await db.execute('SELECT used FROM ai_course_usage WHERE user_id = ? AND day = CURDATE()', [userId]);
    const used = rows.length ? Number(rows[0].used) : 0;
    return { limit: dailyLimit(), used, remaining: Math.max(0, dailyLimit() - used) };
}

async function mine(db, id, userId) {
    const [rows] = await db.execute('SELECT id, title, description, category, status, ai_provider, created_at FROM courses WHERE id = ? AND is_ai = 1 AND creator_id = ?', [id, userId]);
    return rows[0] || null;
}

const shape = (c) => ({ id: c.id, title: c.title, description: c.description, category: c.category, public: c.status === 'active', demo: c.ai_provider === 'demo', created_at: c.created_at });

router.get('/', async (req, res) => {
    try {
        const [rows] = await req.db.execute(`
            SELECT c.id, c.title, c.description, c.category, c.status, c.ai_provider, c.created_at,
                (SELECT COUNT(*) FROM course_content x WHERE x.course_id = c.id) AS lessons,
                (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.user_id != ? AND e.status = 'active') AS students
            FROM courses c WHERE c.is_ai = 1 AND c.creator_id = ? ORDER BY c.id DESC LIMIT 100
        `, [req.user.userId, req.user.userId]);
        res.json({ courses: rows.map((c) => ({ ...shape(c), lessons: Number(c.lessons), students: Number(c.students) })), ...(await usage(req.db, req.user.userId)) });
    } catch (e) {
        console.error('AI courses list error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid course id' });
        const course = await mine(req.db, id, req.user.userId);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const [lessons] = await req.db.execute('SELECT id, title, body, position FROM course_content WHERE course_id = ? ORDER BY position, id', [id]);
        res.json({ course: shape(course), lessons });
    } catch (e) {
        console.error('AI course read error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// The brief: what the course is about, for whom, how long, in what style
function readBrief(body) {
    const topic = validateText(body.topic, { field: 'Topic', maxLength: 200 });
    if (topic.error) return { error: topic.error };
    if (topic.value.length < 3) return { error: 'Topic is too short' };
    const level = body.level === undefined ? LEVELS[0] : body.level;
    if (!LEVELS.includes(level)) return { error: 'Level must be one of: ' + LEVELS.join(', ') };
    const lessons = Number(body.lessons === undefined ? 5 : body.lessons);
    if (!Number.isInteger(lessons) || lessons < 3 || lessons > 8) return { error: 'Lessons must be a number from 3 to 8' };
    const style = validateText(body.style, { field: 'Style', required: false, maxLength: 200 });
    if (style.error) return { error: style.error };
    const goal = validateText(body.goal, { field: 'Goal', required: false, maxLength: 300 });
    if (goal.error) return { error: goal.error };
    return { brief: { topic: topic.value, level, lessons, style: style.value, goal: goal.value } };
}

router.post('/', requireVerifiedEmail, async (req, res) => {
    const userId = req.user.userId;
    let locked = false;
    let reserved = false;
    try {
        const db = req.db;
        const parsed = readBrief(req.body || {});
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        if (busy.has(userId)) return res.status(429).json({ error: 'Wait for the previous course' });
        busy.add(userId); locked = true;

        await db.execute('INSERT IGNORE INTO ai_course_usage (user_id, day, used) VALUES (?, CURDATE(), 0)', [userId]);
        const [taken] = await db.execute('UPDATE ai_course_usage SET used = used + 1 WHERE user_id = ? AND day = CURDATE() AND used < ?', [userId, dailyLimit()]);
        if (!taken.affectedRows) return res.status(429).json({ error: 'Daily limit reached', ...(await usage(db, userId)) });
        reserved = true;

        const { course, provider } = await courseDraft(parsed.brief);
        // Private by default ('inactive'): only the creator can open it until they publish it
        const [ins] = await db.execute(
            "INSERT INTO courses (title, description, category, teacher_id, creator_id, is_ai, ai_provider, status) VALUES (?, ?, ?, ?, ?, 1, ?, 'inactive')",
            [course.title, course.description || null, course.category, userId, userId, provider]
        );
        for (let i = 0; i < course.lessons.length; i++) {
            const l = course.lessons[i];
            await db.execute("INSERT INTO course_content (course_id, kind, title, url, body, position) VALUES (?, 'lesson', ?, NULL, ?, ?)", [ins.insertId, l.title, l.body, i + 1]);
        }
        reserved = false;
        res.status(201).json({ courseId: ins.insertId, provider, ...(await usage(db, userId)) });
    } catch (e) {
        console.error('AI course create error:', e.message);
        if (reserved) await req.db.execute('UPDATE ai_course_usage SET used = used - 1 WHERE user_id = ? AND day = CURDATE() AND used > 0', [userId]).catch(() => {});
        res.status(502).json({ error: 'The AI could not make the course, try again in a minute' });
    } finally {
        if (locked) busy.delete(userId);
    }
});

// Make the course public or private again
router.patch('/:id', requireVerifiedEmail, async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid course id' });
        if (typeof req.body.public !== 'boolean') return res.status(400).json({ error: 'public must be true or false' });
        const course = await mine(req.db, id, req.user.userId);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        if (req.body.public) {
            // The creator vouches for a public course: they must say they checked it
            if (req.body.confirmed !== true) return res.status(400).json({ error: 'Confirm that you checked the course', code: 'CONFIRM_REQUIRED' });
            if (course.ai_provider === 'demo') return res.status(400).json({ error: 'Demo courses cannot be made public. Connect the AI first', code: 'DEMO_COURSE' });
            await req.db.execute("UPDATE courses SET status = 'active' WHERE id = ?", [id]);
            await ensureCourseGroup(req.db, { id, title: course.title, description: course.description, teacher_id: req.user.userId });
        } else {
            await req.db.execute("UPDATE courses SET status = 'inactive' WHERE id = ?", [id]);
        }
        res.json({ public: req.body.public });
    } catch (e) {
        console.error('AI course publish error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid course id' });
        const course = await mine(req.db, id, req.user.userId);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const [others] = await req.db.execute("SELECT COUNT(*) AS n FROM course_enrollments WHERE course_id = ? AND user_id != ? AND status = 'active'", [id, req.user.userId]);
        if (Number(others[0].n) > 0) return res.status(409).json({ error: 'Students are enrolled. Make the course private first' });
        await req.db.execute('DELETE FROM courses WHERE id = ? AND creator_id = ? AND is_ai = 1', [id, req.user.userId]);
        res.json({ message: 'Course deleted' });
    } catch (e) {
        console.error('AI course delete error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
