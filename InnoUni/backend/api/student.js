const express = require('express');
const router = express.Router();
const { studentOnly, authenticateToken } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');
const { addToCourseGroup } = require('../utils/courseGroups');
const { recomputeProgress } = require('../utils/progress');

// Enroll in a course
// Course catalogue: every active course, with my enrollment (if any)
// AI-made courses are credited to the platform and the person who made them
const creditName = (c) => (Number(c.is_ai) === 1 ? 'Gather Edu × ' + (c.teacher || 'muallif') : c.teacher);

// Sorting is picked from this list only: nothing the user typed goes into the SQL text
const COURSE_SORT = {
    new: 'c.id DESC',
    popular: 'students DESC, c.id DESC',
    title: 'c.title ASC, c.id DESC'
};

router.get('/courses', authenticateToken, studentOnly, async (req, res) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
        const sort = COURSE_SORT[req.query.sort] ? req.query.sort : 'new';
        const params = [req.user.userId];
        let search = '';
        if (q) {
            const like = '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
            search = 'AND (c.title LIKE ? OR c.description LIKE ? OR c.category LIKE ? OR u.full_name LIKE ?)';
            params.push(like, like, like, like);
        }
        const [rows] = await req.db.execute(`
            SELECT c.id, c.title, c.description, c.category, c.avatar, c.is_ai, u.full_name AS teacher,
                (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS students,
                ce.progress AS my_progress, ce.status AS my_status
            FROM courses c
            LEFT JOIN users u ON c.teacher_id = u.id
            LEFT JOIN course_enrollments ce ON ce.course_id = c.id AND ce.user_id = ?
            WHERE c.status = 'active' ${search}
            ORDER BY ${COURSE_SORT[sort]}
            LIMIT 200
        `, params);
        res.json({
            courses: rows.map((c) => ({
                id: c.id, title: c.title, description: c.description, category: c.category, avatar: c.avatar,
                teacher: creditName(c), ai: Number(c.is_ai) === 1, students: Number(c.students) || 0,
                enrolled: c.my_status !== null && c.my_status !== undefined,
                progress: c.my_progress === null || c.my_progress === undefined ? 0 : Number(c.my_progress)
            })),
            q, sort
        });
    } catch (error) {
        console.error('Course catalogue error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Lessons and guides of a course I am enrolled in
router.get('/courses/:courseId/content', authenticateToken, studentOnly, async (req, res) => {
    try {
        const courseId = Number(req.params.courseId);
        if (!Number.isInteger(courseId) || courseId < 1) return res.status(400).json({ error: 'Invalid course id' });
        const [rows] = await req.db.execute(`
            SELECT c.id, c.title, c.description, c.category, c.is_ai, u.full_name AS teacher, ce.progress AS my_progress
            FROM courses c
            JOIN course_enrollments ce ON ce.course_id = c.id AND ce.user_id = ? AND ce.status = 'active'
            LEFT JOIN users u ON c.teacher_id = u.id
            WHERE c.id = ? AND c.status = 'active'
        `, [req.user.userId, courseId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Course not found or you are not enrolled' });
        const c = rows[0];
        const [items] = await req.db.execute(
            'SELECT id, kind, title, url, body, position FROM course_content WHERE course_id = ? ORDER BY position, id',
            [courseId]
        );
        const ai = Number(c.is_ai) === 1;
        const [last] = await req.db.execute('SELECT item_id FROM course_resume WHERE user_id = ? AND course_id = ?', [req.user.userId, courseId]);
        res.json({
            course: { id: c.id, title: c.title, description: c.description, category: c.category, teacher: creditName(c), ai, progress: Number(c.my_progress) || 0 },
            // where the student stopped last time (an item that was deleted since is gone with its row)
            resume: last.length ? last[0].item_id : null,
            // An AI lesson is taught step by step (plan, chat, quiz) through /api/ai-lessons: its text is not handed out here
            items: ai ? items.map((it) => (it.kind === 'lesson' ? { ...it, body: null } : it)) : items
        });
    } catch (error) {
        console.error('Course content error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Remember the item the student opened last, so "Davom ettirish" can bring them back
router.put('/courses/:courseId/resume', authenticateToken, studentOnly, async (req, res) => {
    try {
        const courseId = Number(req.params.courseId);
        const itemId = Number(req.body.item_id);
        if (!Number.isInteger(courseId) || courseId < 1 || !Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ error: 'Invalid course or item id' });
        const [ok] = await req.db.execute(
            `SELECT 1 AS ok FROM course_content cc JOIN course_enrollments ce ON ce.course_id = cc.course_id AND ce.user_id = ? AND ce.status = 'active'
             WHERE cc.id = ? AND cc.course_id = ?`, [req.user.userId, itemId, courseId]);
        if (!ok.length) return res.status(404).json({ error: 'Item not found in a course you are enrolled in' });
        await req.db.execute('INSERT INTO course_resume (user_id, course_id, item_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE item_id = VALUES(item_id)', [req.user.userId, courseId, itemId]);
        res.json({ ok: true });
    } catch (error) {
        console.error('Course resume error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/courses/:courseId/enroll', authenticateToken, studentOnly, async (req, res) => {
    try {
        const db = req.db;
        const courseId = req.params.courseId;
        const userId = req.user.userId;

        // Check if already enrolled
        const [existing] = await db.execute(
            'SELECT id FROM course_enrollments WHERE course_id = ? AND user_id = ?',
            [courseId, userId]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Already enrolled in this course' });
        }

        // Check if course exists and is active
        const [course] = await db.execute(
            'SELECT id, title, description, teacher_id FROM courses WHERE id = ? AND status = "active"',
            [courseId]
        );

        if (course.length === 0) {
            return res.status(404).json({ error: 'Course not found or inactive' });
        }

        // Enroll student
        await db.execute(
            'INSERT INTO course_enrollments (course_id, user_id) VALUES (?, ?)',
            [courseId, userId]
        );
        await addToCourseGroup(db, course[0], userId); // the course group is joined automatically

        res.json({ message: 'Successfully enrolled in course' });
    } catch (error) {
        console.error('Course enrollment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update course progress
// Progress is calculated by the server from submitted tasks (see utils/progress.js).
// A student cannot set it: otherwise anyone could mark a course as completed and print a certificate.
router.put('/courses/:courseId/progress', authenticateToken, studentOnly, (req, res) => {
    res.status(403).json({ error: 'Progress is calculated automatically from your submitted tasks' });
});

// Complete a task
router.put('/tasks/:taskId/complete', authenticateToken, studentOnly, async (req, res) => {
    try {
        const db = req.db;
        const taskId = req.params.taskId;
        const userId = req.user.userId;

        // Check if task belongs to user
        const [task] = await db.execute(
            'SELECT id FROM tasks WHERE id = ? AND assigned_to = ?',
            [taskId, userId]
        );

        if (task.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // A task counts as done only after the student has really submitted an answer
        const [sub] = await db.execute('SELECT id FROM task_submissions WHERE task_id = ? AND student_id = ?', [taskId, userId]);
        if (sub.length === 0) {
            return res.status(409).json({ error: 'Submit an answer first' });
        }

        // Mark as completed
        await db.execute(
            'UPDATE tasks SET status = "completed" WHERE id = ?',
            [taskId]
        );

        res.json({ message: 'Task marked as completed' });
    } catch (error) {
        console.error('Task completion error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// A task the student may work on: assigned to them, or a course task of a course they are enrolled in
async function findVisibleTask(db, taskId, userId) {
    const [rows] = await db.execute(`
        SELECT t.id, t.assigned_to, t.course_id
        FROM tasks t
        LEFT JOIN course_enrollments ce ON ce.course_id = t.course_id AND ce.user_id = ? AND ce.status = 'active'
        WHERE t.id = ? AND (t.assigned_to = ? OR (t.assigned_to IS NULL AND ce.id IS NOT NULL))
    `, [userId, taskId, userId]);
    return rows[0] || null;
}

// All my tasks (assigned to me + course tasks), with my submission, grade and feedback
router.get('/tasks', authenticateToken, studentOnly, async (req, res) => {
    try {
        const uid = req.user.userId;
        const [rows] = await req.db.execute(`
            SELECT t.id, t.title, t.description, t.course_id, c.title AS course_title,
                DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date,
                s.status AS sub_status, s.grade, s.feedback, s.content, s.submitted_at
            FROM tasks t
            JOIN courses c ON c.id = t.course_id
            LEFT JOIN course_enrollments ce ON ce.course_id = t.course_id AND ce.user_id = ? AND ce.status = 'active'
            LEFT JOIN task_submissions s ON s.task_id = t.id AND s.student_id = ?
            WHERE t.assigned_to = ? OR (t.assigned_to IS NULL AND ce.id IS NOT NULL)
            ORDER BY (s.id IS NULL) DESC, (t.due_date IS NULL), t.due_date ASC, t.id DESC
            LIMIT 200
        `, [uid, uid, uid]);
        res.json({
            tasks: rows.map((t) => ({
                id: t.id, title: t.title, description: t.description, courseId: t.course_id, course: t.course_title, dueDate: t.due_date,
                status: t.sub_status === 'graded' ? 'graded' : t.sub_status === 'submitted' ? 'submitted' : 'todo',
                grade: t.grade === null || t.grade === undefined ? null : Number(t.grade),
                feedback: t.feedback || null, content: t.content || null, submittedAt: t.submitted_at || null
            }))
        });
    } catch (error) {
        console.error('My tasks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Submit (or re-submit, until it is graded) the answer to a task assigned to the student
router.post('/tasks/:taskId/submit', authenticateToken, studentOnly, async (req, res) => {
    try {
        const db = req.db;
        const userId = req.user.userId;

        const taskId = parseId(req.params.taskId);
        if (!taskId) {
            return res.status(400).json({ error: 'Invalid task id' });
        }

        const contentResult = validateText(req.body.content, { field: 'Answer', required: true, maxLength: 10000 });
        if (contentResult.error) {
            return res.status(400).json({ error: contentResult.error });
        }

        const task = await findVisibleTask(db, taskId, userId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const [existing] = await db.execute(
            'SELECT id, status FROM task_submissions WHERE task_id = ? AND student_id = ?',
            [taskId, userId]
        );

        if (existing.length === 0) {
            await db.execute(
                'INSERT INTO task_submissions (task_id, student_id, content) VALUES (?, ?, ?)',
                [taskId, userId, contentResult.value]
            );
        } else if (existing[0].status === 'graded') {
            return res.status(409).json({ error: 'This submission has already been graded and can no longer be changed' });
        } else {
            await db.execute(
                'UPDATE task_submissions SET content = ?, submitted_at = NOW() WHERE id = ?',
                [contentResult.value, existing[0].id]
            );
        }

        // A task assigned to me counts as completed once submitted (a course task is shared, so its status stays)
        if (task.assigned_to === userId) {
            await db.execute('UPDATE tasks SET status = "completed" WHERE id = ?', [taskId]);
        }

        if (task.course_id) {
            await recomputeProgress(db, task.course_id, userId);
            await checkAchievements(userId, db);
        }

        res.status(existing.length === 0 ? 201 : 200).json({ message: 'Task submitted successfully' });
    } catch (error) {
        console.error('Task submission error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// The student's own submission for a task, including grade and feedback
router.get('/tasks/:taskId/submission', authenticateToken, studentOnly, async (req, res) => {
    try {
        const taskId = parseId(req.params.taskId);
        if (!taskId) {
            return res.status(400).json({ error: 'Invalid task id' });
        }

        const [rows] = await req.db.execute(`
            SELECT s.task_id, s.content, s.status, s.grade, s.feedback, s.submitted_at, s.graded_at
            FROM task_submissions s
            WHERE s.task_id = ? AND s.student_id = ?
        `, [taskId, req.user.userId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No submission found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Submission lookup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to check and award achievements
async function checkAchievements(userId, db) {
    // Check for course completion achievements
    const [completedCourses] = await db.execute(
        'SELECT COUNT(*) as count FROM course_enrollments WHERE user_id = ? AND status = "completed"',
        [userId]
    );

    if (completedCourses[0].count >= 10) {
        await awardAchievement(userId, 4, db); // "Sertifikatli" achievement
    }

    // Check for task completion achievements
    const [completedTasks] = await db.execute(
        'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND status = "completed"',
        [userId]
    );

    if (completedTasks[0].count >= 100) {
        await awardAchievement(userId, 2, db); // "Kod ustasi" achievement
    }
}

async function awardAchievement(userId, achievementId, db) {
    try {
        await db.execute(
            'INSERT IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)',
            [userId, achievementId]
        );
    } catch (error) {
        console.error('Achievement award error:', error);
    }
}

module.exports = router;
