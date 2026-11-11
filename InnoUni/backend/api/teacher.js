const express = require('express');
const router = express.Router();
const { teacherOnly, authenticateToken, requireSelf } = require('../middleware/roleBased');
const { parseId, validateGrade, validateText, validateUrl } = require('../utils/validation');

// Get teacher dashboard data
router.get('/dashboard/:userId', authenticateToken, teacherOnly, requireSelf(), async (req, res) => {
    try {
        const db = req.db;
        const userId = req.params.userId;

        // Get teacher's courses with enrollment stats
        const [courses] = await db.execute(`
            SELECT 
                c.id, c.title, c.description, c.category, c.avatar, c.status,
                COUNT(ce.user_id) as enrolled_students,
                AVG(ce.progress) as avg_progress,
                COUNT(CASE WHEN ce.status = 'completed' THEN 1 END) as completed_students,
                COUNT(CASE WHEN ce.enrolled_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as new_enrollments_this_week
            FROM courses c
            LEFT JOIN course_enrollments ce ON c.id = ce.course_id AND ce.status = 'active'
            WHERE c.teacher_id = ?
            GROUP BY c.id, c.title, c.description, c.category, c.avatar, c.status
            ORDER BY c.created_at DESC
        `, [userId]);

        // Get teacher's statistics
        const [stats] = await db.execute(`
            SELECT 
                COUNT(DISTINCT c.id) as total_courses,
                COUNT(DISTINCT ce.user_id) as total_students,
                COUNT(CASE WHEN ce.status = 'completed' THEN 1 END) as total_completions,
                AVG(ce.progress) as avg_course_progress,
                COUNT(DISTINCT t.id) as total_tasks_assigned,
                COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as total_tasks_completed
            FROM courses c
            LEFT JOIN course_enrollments ce ON c.id = ce.course_id
            LEFT JOIN tasks t ON c.id = t.course_id
            WHERE c.teacher_id = ?
        `, [userId]);

        // Get recent student activities
        const [recentActivities] = await db.execute(`
            SELECT 
                'enrollment' as activity_type,
                ce.enrolled_at as timestamp,
                c.title as course_title,
                u.full_name as student_name,
                ce.progress as student_progress
            FROM course_enrollments ce
            JOIN courses c ON ce.course_id = c.id
            JOIN users u ON ce.user_id = u.id
            WHERE c.teacher_id = ?
            ORDER BY ce.enrolled_at DESC
            LIMIT 10
        `, [userId]);

        // Get task statistics
        const [taskStats] = await db.execute(`
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_tasks,
                COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress_tasks,
                COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
                COUNT(CASE WHEN t.due_date < CURDATE() AND t.status != 'completed' THEN 1 END) as overdue_tasks
            FROM tasks t
            JOIN courses c ON t.course_id = c.id
            WHERE c.teacher_id = ?
        `, [userId]);

        res.json({
            courses,
            stats: stats[0],
            recentActivities,
            taskStats: taskStats[0]
        });
    } catch (error) {
        console.error('Teacher dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get teacher's courses with detailed analytics
router.get('/courses/:userId', authenticateToken, teacherOnly, requireSelf(), async (req, res) => {
    try {
        const db = req.db;
        const userId = req.params.userId;
        const { category, status } = req.query;

        let query = `
            SELECT 
                c.*,
                COUNT(ce.user_id) as enrolled_students,
                AVG(ce.progress) as avg_progress,
                COUNT(CASE WHEN ce.status = 'completed' THEN 1 END) as completed_students,
                COUNT(CASE WHEN ce.enrolled_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as new_enrollments_this_week
            FROM courses c
            LEFT JOIN course_enrollments ce ON c.id = ce.course_id AND ce.status = 'active'
            WHERE c.teacher_id = ?
        `;
        const params = [userId];

        if (category) {
            query += ' AND c.category = ?';
            params.push(category);
        }

        if (status) {
            query += ' AND c.status = ?';
            params.push(status);
        }

        query += ' GROUP BY c.id, c.title, c.description, c.category, c.avatar, c.status ORDER BY c.created_at DESC';

        const [courses] = await db.execute(query, params);

        // Get detailed analytics for each course
        for (let course of courses) {
            const [analytics] = await db.execute(`
                SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
                    AVG(CASE WHEN t.status = 'completed' THEN 100 ELSE 0 END) as avg_completion_rate,
                    COUNT(DISTINCT t.assigned_to) as unique_students_assigned
                FROM tasks t
                WHERE t.course_id = ?
            `, [course.id]);

            course.analytics = analytics[0];
        }

        res.json(courses);
    } catch (error) {
        console.error('Teacher courses error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const MAX_CONTENT_PER_COURSE = 200;

// The teacher's own course, or null (not found and "not yours" look the same)
async function ownCourse(db, courseId, teacherId) {
    const [rows] = await db.execute('SELECT id, title, description, category, status FROM courses WHERE id = ? AND teacher_id = ?', [courseId, teacherId]);
    return rows[0] || null;
}

// My courses with content and student counts (for the course list)
router.get('/courses', authenticateToken, teacherOnly, async (req, res) => {
    try {
        const [courses] = await req.db.execute(`
            SELECT c.id, c.title, c.description, c.category, c.status, c.created_at,
                (SELECT COUNT(*) FROM course_content x WHERE x.course_id = c.id AND x.kind = 'video') AS videos,
                (SELECT COUNT(*) FROM course_content x WHERE x.course_id = c.id AND x.kind = 'guide') AS guides,
                (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS students
            FROM courses c
            WHERE c.teacher_id = ?
            ORDER BY c.id DESC
        `, [req.user.userId]);
        res.json({
            courses: courses.map((c) => ({ ...c, videos: Number(c.videos), guides: Number(c.guides), students: Number(c.students) }))
        });
    } catch (error) {
        console.error('My courses error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a course. It starts as a draft ('inactive'); students see it only after it is published.
router.post('/courses', authenticateToken, teacherOnly, async (req, res) => {
    const title = validateText(req.body.title, { field: 'Title', maxLength: 255 });
    if (title.error) return res.status(400).json({ error: title.error });
    const category = validateText(req.body.category, { field: 'Category', maxLength: 100 });
    if (category.error) return res.status(400).json({ error: category.error });
    const description = validateText(req.body.description, { field: 'Description', required: false, maxLength: 2000 });
    if (description.error) return res.status(400).json({ error: description.error });
    try {
        const [result] = await req.db.execute(
            "INSERT INTO courses (title, description, category, teacher_id, status) VALUES (?, ?, ?, ?, 'inactive')",
            [title.value, description.value, category.value, req.user.userId]
        );
        res.status(201).json({ message: 'Course created successfully', courseId: result.insertId });
    } catch (error) {
        console.error('Course creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a course. Only the fields that are sent change. Publishing needs at least one lesson or guide.
router.put('/courses/:courseId', authenticateToken, teacherOnly, async (req, res) => {
    const courseId = parseId(req.params.courseId);
    if (!courseId) return res.status(400).json({ error: 'Invalid course id' });
    const sets = [];
    const params = [];
    if (req.body.title !== undefined) {
        const t = validateText(req.body.title, { field: 'Title', maxLength: 255 });
        if (t.error) return res.status(400).json({ error: t.error });
        sets.push('title = ?'); params.push(t.value);
    }
    if (req.body.category !== undefined) {
        const c = validateText(req.body.category, { field: 'Category', maxLength: 100 });
        if (c.error) return res.status(400).json({ error: c.error });
        sets.push('category = ?'); params.push(c.value);
    }
    if (req.body.description !== undefined) {
        const d = validateText(req.body.description, { field: 'Description', required: false, maxLength: 2000 });
        if (d.error) return res.status(400).json({ error: d.error });
        sets.push('description = ?'); params.push(d.value);
    }
    if (req.body.status !== undefined) {
        if (!['active', 'inactive'].includes(req.body.status)) return res.status(400).json({ error: 'Status must be active or inactive' });
        sets.push('status = ?'); params.push(req.body.status);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    try {
        const course = await ownCourse(req.db, courseId, req.user.userId);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        if (req.body.status === 'active') {
            const [n] = await req.db.execute('SELECT COUNT(*) AS n FROM course_content WHERE course_id = ?', [courseId]);
            if (!Number(n[0].n)) return res.status(400).json({ error: 'Add at least one lesson or guide before publishing' });
        }
        await req.db.execute(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`, [...params, courseId]);
        res.json({ message: 'Course updated successfully' });
    } catch (error) {
        console.error('Course update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Course details with its lessons (videos) and guides, in order
router.get('/courses/:courseId/content', authenticateToken, teacherOnly, async (req, res) => {
    const courseId = parseId(req.params.courseId);
    if (!courseId) return res.status(400).json({ error: 'Invalid course id' });
    try {
        const course = await ownCourse(req.db, courseId, req.user.userId);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const [items] = await req.db.execute('SELECT id, kind, title, url, position FROM course_content WHERE course_id = ? ORDER BY position, id', [courseId]);
        res.json({ course, items });
    } catch (error) {
        console.error('Course content error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a video lesson or a guide (a link: YouTube/Vimeo/Drive for videos, PDF or document link for guides)
router.post('/courses/:courseId/content', authenticateToken, teacherOnly, async (req, res) => {
    const courseId = parseId(req.params.courseId);
    if (!courseId) return res.status(400).json({ error: 'Invalid course id' });
    if (!['video', 'guide'].includes(req.body.kind)) return res.status(400).json({ error: 'Kind must be video or guide' });
    const title = validateText(req.body.title, { field: 'Title', maxLength: 200 });
    if (title.error) return res.status(400).json({ error: title.error });
    const url = validateUrl(req.body.url);
    if (url.error) return res.status(400).json({ error: url.error });
    try {
        const course = await ownCourse(req.db, courseId, req.user.userId);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const [stat] = await req.db.execute('SELECT COUNT(*) AS n, COALESCE(MAX(position), 0) AS last FROM course_content WHERE course_id = ?', [courseId]);
        if (Number(stat[0].n) >= MAX_CONTENT_PER_COURSE) return res.status(400).json({ error: `A course can have at most ${MAX_CONTENT_PER_COURSE} items` });
        const [r] = await req.db.execute(
            'INSERT INTO course_content (course_id, kind, title, url, position) VALUES (?, ?, ?, ?, ?)',
            [courseId, req.body.kind, title.value, url.value, Number(stat[0].last) + 1]
        );
        res.status(201).json({ id: r.insertId });
    } catch (error) {
        console.error('Add content error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Remove an item. A published course must keep at least one item.
router.delete('/courses/:courseId/content/:itemId', authenticateToken, teacherOnly, async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const itemId = parseId(req.params.itemId);
    if (!courseId || !itemId) return res.status(400).json({ error: 'Invalid id' });
    try {
        const course = await ownCourse(req.db, courseId, req.user.userId);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        if (course.status === 'active') {
            const [n] = await req.db.execute('SELECT COUNT(*) AS n FROM course_content WHERE course_id = ?', [courseId]);
            if (Number(n[0].n) <= 1) return res.status(400).json({ error: 'A published course needs at least one item. Unpublish it first.' });
        }
        const [r] = await req.db.execute('DELETE FROM course_content WHERE id = ? AND course_id = ?', [itemId, courseId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Item not found' });
        res.json({ message: 'Removed' });
    } catch (error) {
        console.error('Remove content error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Move an item one step up or down among items of its own kind
router.post('/courses/:courseId/content/:itemId/move', authenticateToken, teacherOnly, async (req, res) => {
    const courseId = parseId(req.params.courseId);
    const itemId = parseId(req.params.itemId);
    if (!courseId || !itemId) return res.status(400).json({ error: 'Invalid id' });
    if (!['up', 'down'].includes(req.body.direction)) return res.status(400).json({ error: 'Direction must be up or down' });
    try {
        const course = await ownCourse(req.db, courseId, req.user.userId);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        // Neighbours are taken within the same kind, so a video never swaps with a guide
        const [all] = await req.db.execute('SELECT id, kind, position FROM course_content WHERE course_id = ? ORDER BY position, id', [courseId]);
        const me = all.find((x) => x.id === itemId);
        if (!me) return res.status(404).json({ error: 'Item not found' });
        const same = all.filter((x) => x.kind === me.kind);
        const i = same.findIndex((x) => x.id === itemId);
        const other = same[req.body.direction === 'up' ? i - 1 : i + 1];
        if (other) {
            await req.db.execute('UPDATE course_content SET position = ? WHERE id = ?', [other.position, me.id]);
            await req.db.execute('UPDATE course_content SET position = ? WHERE id = ?', [me.position, other.id]);
        }
        res.json({ message: 'Moved' });
    } catch (error) {
        console.error('Move content error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get course students with their progress
router.get('/courses/:courseId/students', authenticateToken, teacherOnly, async (req, res) => {
    try {
        const db = req.db;
        const courseId = req.params.courseId;
        const teacherId = req.user.userId;

        // Check if course belongs to teacher
        const [course] = await db.execute(
            'SELECT id FROM courses WHERE id = ? AND teacher_id = ?',
            [courseId, teacherId]
        );

        if (course.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const [students] = await db.execute(`
            SELECT 
                u.id, u.full_name, u.email, u.phone, u.avatar,
                ce.progress, ce.enrolled_at, ce.status as enrollment_status,
                COUNT(t.id) as completed_tasks,
                COUNT(CASE WHEN t.status = 'pending' AND t.due_date <= CURDATE() THEN 1 END) as overdue_tasks
            FROM users u
            JOIN course_enrollments ce ON u.id = ce.user_id
            LEFT JOIN tasks t ON t.course_id = ce.course_id AND t.assigned_to = u.id
            WHERE ce.course_id = ?
            GROUP BY u.id, u.full_name, u.email, u.phone, u.avatar, ce.progress, ce.enrolled_at, ce.status
            ORDER BY ce.enrolled_at DESC
        `, [courseId]);

        res.json(students);
    } catch (error) {
        console.error('Course students error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create and assign tasks to students
router.post('/tasks', authenticateToken, teacherOnly, async (req, res) => {
    try {
        const db = req.db;
        const { title, description, course_id, priority, due_date, assigned_to } = req.body;
        const teacherId = req.user.userId;

        // Validate that course belongs to teacher
        const [course] = await db.execute(
            'SELECT id FROM courses WHERE id = ? AND teacher_id = ?',
            [course_id, teacherId]
        );

        if (course.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const [result] = await db.execute(
            'INSERT INTO tasks (title, description, course_id, priority, due_date, assigned_to) VALUES (?, ?, ?, ?, ?, ?)',
            [title, description, course_id, priority, due_date, assigned_to]
        );

        res.status(201).json({
            message: 'Task created successfully',
            taskId: result.insertId
        });
    } catch (error) {
        console.error('Task creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all tasks created by teacher
router.get('/tasks/:userId', authenticateToken, teacherOnly, requireSelf(), async (req, res) => {
    try {
        const db = req.db;
        const userId = req.params.userId;
        const { status, course_id } = req.query;

        let query = `
            SELECT 
                t.*, c.title as course_title,
                u.full_name as assigned_student_name,
                u.email as assigned_student_email
            FROM tasks t
            JOIN courses c ON t.course_id = c.id
            LEFT JOIN users u ON t.assigned_to = u.id
            WHERE c.teacher_id = ?
        `;
        const params = [userId];

        if (status) {
            query += ' AND t.status = ?';
            params.push(status);
        }

        if (course_id) {
            query += ' AND t.course_id = ?';
            params.push(course_id);
        }

        query += ' ORDER BY t.due_date ASC';

        const [tasks] = await db.execute(query, params);
        res.json(tasks);
    } catch (error) {
        console.error('Teacher tasks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Loads a task only if it belongs to one of the teacher's courses
async function findOwnTask(db, taskId, teacherId) {
    const [rows] = await db.execute(`
        SELECT t.id, t.title, t.assigned_to
        FROM tasks t
        JOIN courses c ON t.course_id = c.id
        WHERE t.id = ? AND c.teacher_id = ?
    `, [taskId, teacherId]);
    return rows[0] || null;
}

// List submissions for one of the teacher's tasks
router.get('/tasks/:taskId/submissions', authenticateToken, teacherOnly, async (req, res) => {
    try {
        const taskId = parseId(req.params.taskId);
        if (!taskId) {
            return res.status(400).json({ error: 'Invalid task id' });
        }

        const task = await findOwnTask(req.db, taskId, req.user.userId);
        if (!task) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const [submissions] = await req.db.execute(`
            SELECT s.id, s.task_id, s.student_id, u.full_name AS student_name, u.email AS student_email,
                   s.content, s.status, s.grade, s.feedback, s.submitted_at, s.graded_at
            FROM task_submissions s
            JOIN users u ON s.student_id = u.id
            WHERE s.task_id = ?
            ORDER BY s.submitted_at DESC
        `, [taskId]);

        res.json(submissions);
    } catch (error) {
        console.error('Task submissions error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Grade a student's submission
router.post('/tasks/:taskId/grade', authenticateToken, teacherOnly, async (req, res) => {
    try {
        const db = req.db;
        const teacherId = req.user.userId;

        const taskId = parseId(req.params.taskId);
        if (!taskId) {
            return res.status(400).json({ error: 'Invalid task id' });
        }

        const gradeResult = validateGrade(req.body.grade);
        if (gradeResult.error) {
            return res.status(400).json({ error: gradeResult.error });
        }

        const feedbackResult = validateText(req.body.feedback, { field: 'Feedback', required: false, maxLength: 2000 });
        if (feedbackResult.error) {
            return res.status(400).json({ error: feedbackResult.error });
        }

        // Verify task belongs to teacher's course
        const task = await findOwnTask(db, taskId, teacherId);
        if (!task) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // A task is assigned to one student: that student's submission is the one being graded.
        // student_id may be sent to be explicit, but it must match the assignment.
        if (!task.assigned_to) {
            return res.status(400).json({ error: 'This task is not assigned to a student' });
        }
        if (req.body.student_id !== undefined && parseId(req.body.student_id) !== task.assigned_to) {
            return res.status(400).json({ error: 'student_id does not match the student this task is assigned to' });
        }

        const [submissions] = await db.execute(
            'SELECT id FROM task_submissions WHERE task_id = ? AND student_id = ?',
            [taskId, task.assigned_to]
        );
        if (submissions.length === 0) {
            return res.status(404).json({ error: 'The student has not submitted this task yet' });
        }

        await db.execute(`
            UPDATE task_submissions
            SET grade = ?, feedback = ?, status = 'graded', graded_at = NOW(), graded_by = ?
            WHERE id = ?
        `, [gradeResult.value, feedbackResult.value, teacherId, submissions[0].id]);

        res.json({
            message: 'Submission graded successfully',
            taskId,
            studentId: task.assigned_to,
            grade: gradeResult.value,
            feedback: feedbackResult.value
        });
    } catch (error) {
        console.error('Task grading error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get teacher's library (uploaded materials)
router.get('/library/:userId', authenticateToken, teacherOnly, requireSelf(), async (req, res) => {
    try {
        const userId = req.params.userId;

        // This would need a materials table implementation
        res.json({
            message: 'Library endpoint - needs materials table implementation',
            materials: [],
            categories: ['Documents', 'Videos', 'Images', 'Audio']
        });
    } catch (error) {
        console.error('Library error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get analytics for teacher's courses
router.get('/analytics/:userId', authenticateToken, teacherOnly, requireSelf(), async (req, res) => {
    try {
        const db = req.db;
        const userId = req.params.userId;
        const { courseId, period = '30' } = req.query;

        // Get enrollment trends
        const [enrollmentTrends] = await db.execute(`
            SELECT 
                DATE(enrolled_at) as date,
                COUNT(*) as enrollments
            FROM course_enrollments ce
            JOIN courses c ON ce.course_id = c.id
            WHERE c.teacher_id = ? AND ce.enrolled_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(enrolled_at)
            ORDER BY date ASC
        `, [userId, parseInt(period)]);

        // Get completion trends
        const [completionTrends] = await db.execute(`
            SELECT 
                DATE(ce.enrolled_at) as date,
                COUNT(CASE WHEN ce.status = 'completed' THEN 1 END) as completions
            FROM course_enrollments ce
            JOIN courses c ON ce.course_id = c.id
            WHERE c.teacher_id = ? AND ce.status = 'completed' AND ce.enrolled_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(ce.enrolled_at)
            ORDER BY date ASC
        `, [userId, parseInt(period)]);

        // Get course performance
        const [coursePerformance] = await db.execute(`
            SELECT 
                c.id,
                c.title,
                c.category,
                COUNT(ce.user_id) as total_students,
                COUNT(CASE WHEN ce.status = 'completed' THEN 1 END) as completed_students,
                AVG(ce.progress) as avg_progress,
                COUNT(CASE WHEN ce.status = 'completed' AND ce.enrolled_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as recent_completions
            FROM courses c
            LEFT JOIN course_enrollments ce ON c.id = ce.course_id
            WHERE c.teacher_id = ?
            GROUP BY c.id, c.title, c.category
            ORDER BY avg_progress DESC
        `, [userId]);

        res.json({
            enrollmentTrends,
            completionTrends,
            coursePerformance
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
