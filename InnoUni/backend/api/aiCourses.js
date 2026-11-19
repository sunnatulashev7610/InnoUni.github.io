// AI course creator: the user briefs the AI and gets a course.
// A made AI course (not a demo one) is public at once; the creator can make it private. A public AI course is a normal course in the catalogue, credited to "Gather Edu" and the creator.
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
                (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.user_id != ? AND e.status = 'active') AS students,
                (SELECT COUNT(*) FROM ai_course_reports r WHERE r.course_id = c.id AND r.status = 'open') AS reports
            FROM courses c WHERE c.is_ai = 1 AND c.creator_id = ? ORDER BY c.id DESC LIMIT 100
        `, [req.user.userId, req.user.userId]);
        res.json({ courses: rows.map((c) => ({ ...shape(c), lessons: Number(c.lessons), students: Number(c.students), reports: Number(c.reports) })), ...(await usage(req.db, req.user.userId)) });
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
        // A made course joins the main catalogue right away (marked "AI kurs" there); a demo course has placeholder text, so it stays private
        const status = provider === 'demo' ? 'inactive' : 'active';
        const [ins] = await db.execute(
            'INSERT INTO courses (title, description, category, teacher_id, creator_id, is_ai, ai_provider, status) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
            [course.title, course.description || null, course.category, userId, userId, provider, status]
        );
        for (let i = 0; i < course.lessons.length; i++) {
            const l = course.lessons[i];
            await db.execute("INSERT INTO course_content (course_id, kind, title, url, body, position) VALUES (?, 'lesson', ?, NULL, ?, ?)", [ins.insertId, l.title, l.body, i + 1]);
        }
        if (status === 'active') await ensureCourseGroup(db, { id: ins.insertId, title: course.title, description: course.description, teacher_id: userId });
        reserved = false;
        res.status(201).json({ courseId: ins.insertId, provider, public: status === 'active', ...(await usage(db, userId)) });
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

// The creator fixes a lesson (for example after a student reported a mistake)
router.put('/:id/lessons/:lessonId', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const lessonId = parseId(req.params.lessonId);
        if (!id || !lessonId) return res.status(400).json({ error: 'Invalid id' });
        const title = validateText(req.body && req.body.title, { field: 'Title', maxLength: 200 });
        if (title.error) return res.status(400).json({ error: title.error });
        const text = validateText(req.body && req.body.body, { field: 'Body', maxLength: 4000 });
        if (text.error) return res.status(400).json({ error: text.error });
        const course = await mine(req.db, id, req.user.userId);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const [found] = await req.db.execute("SELECT id FROM course_content WHERE id = ? AND course_id = ? AND kind = 'lesson'", [lessonId, id]);
        if (!found.length) return res.status(404).json({ error: 'Lesson not found' });
        await req.db.execute('UPDATE course_content SET title = ?, body = ? WHERE id = ? AND course_id = ?', [title.value, text.value, lessonId, id]);
        res.json({ id: lessonId, title: title.value, body: text.value });
    } catch (e) {
        console.error('AI lesson edit error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const REPORTS_PER_DAY = 10;

// A student who finds a mistake in a public AI course tells the creator
router.post('/:id/reports', async (req, res) => {
    try {
        const db = req.db;
        const userId = req.user.userId;
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid course id' });
        const msg = validateText(req.body && req.body.message, { field: 'Message', maxLength: 500 });
        if (msg.error) return res.status(400).json({ error: msg.error });
        if (msg.value.length < 5) return res.status(400).json({ error: 'Message is too short' });
        let lessonId = null;
        if (req.body.lesson_id !== undefined && req.body.lesson_id !== null) {
            lessonId = parseId(req.body.lesson_id);
            if (!lessonId) return res.status(400).json({ error: 'Invalid lesson id' });
        }
        const [rows] = await db.execute("SELECT id, creator_id FROM courses WHERE id = ? AND is_ai = 1 AND status = 'active'", [id]);
        if (!rows.length) return res.status(404).json({ error: 'Course not found' });
        if (rows[0].creator_id === userId) return res.status(400).json({ error: 'You made this course: edit it instead' });
        const [member] = await db.execute("SELECT 1 AS ok FROM course_enrollments WHERE course_id = ? AND user_id = ? AND status = 'active'", [id, userId]);
        if (!member.length) return res.status(403).json({ error: 'Only students of the course can report a mistake' });
        if (lessonId) {
            const [lesson] = await db.execute('SELECT id FROM course_content WHERE id = ? AND course_id = ?', [lessonId, id]);
            if (!lesson.length) return res.status(404).json({ error: 'Lesson not found' });
        }
        const [today] = await db.execute('SELECT COUNT(*) AS n FROM ai_course_reports WHERE reporter_id = ? AND created_at >= CURDATE()', [userId]);
        if (Number(today[0].n) >= REPORTS_PER_DAY) return res.status(429).json({ error: 'Too many reports today' });
        const [dup] = await db.execute("SELECT 1 AS ok FROM ai_course_reports WHERE course_id = ? AND reporter_id = ? AND status = 'open' AND ((lesson_id IS NULL AND ? IS NULL) OR lesson_id = ?)", [id, userId, lessonId, lessonId]);
        if (dup.length) return res.status(409).json({ error: 'You already reported this, the creator has not answered yet' });
        await db.execute('INSERT INTO ai_course_reports (course_id, lesson_id, reporter_id, message) VALUES (?, ?, ?, ?)', [id, lessonId, userId, msg.value]);
        res.status(201).json({ message: 'Report sent' });
    } catch (e) {
        console.error('AI course report error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// The creator sees the open reports of their course (no names: the reporter stays private)
router.get('/:id/reports', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid course id' });
        const course = await mine(req.db, id, req.user.userId);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const [rows] = await req.db.execute(
            "SELECT r.id, r.lesson_id, cc.title AS lesson_title, r.message, r.created_at FROM ai_course_reports r LEFT JOIN course_content cc ON cc.id = r.lesson_id WHERE r.course_id = ? AND r.status = 'open' ORDER BY r.id DESC LIMIT 100",
            [id]
        );
        res.json({ reports: rows });
    } catch (e) {
        console.error('AI course reports list error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/:id/reports/:reportId', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const reportId = parseId(req.params.reportId);
        if (!id || !reportId) return res.status(400).json({ error: 'Invalid id' });
        const course = await mine(req.db, id, req.user.userId);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const [r] = await req.db.execute("UPDATE ai_course_reports SET status = 'resolved' WHERE id = ? AND course_id = ? AND status = 'open'", [reportId, id]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Report not found' });
        res.json({ resolved: true });
    } catch (e) {
        console.error('AI course report resolve error:', e);
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
        await req.db.execute('DELETE FROM ai_course_reports WHERE course_id = ?', [id]);
        res.json({ message: 'Course deleted' });
    } catch (e) {
        console.error('AI course delete error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
