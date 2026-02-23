const express = require('express');
const router = express.Router();
const { teacherOnly, authenticateToken } = require('../middleware/roleBased');

// Get teacher dashboard data
router.get('/dashboard/:userId', authenticateToken, teacherOnly, async (req, res) => {
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
router.get('/courses/:userId', authenticateToken, teacherOnly, async (req, res) => {
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

// Create a new course
router.post('/courses', authenticateToken, teacherOnly, async (req, res) => {
    try {
        const db = req.db;
        const { title, description, category } = req.body;
        const teacherId = req.user.userId;

        // Validation
        if (!title || !category) {
            return res.status(400).json({ error: 'Title and category are required' });
        }

        const [result] = await db.execute(
            'INSERT INTO courses (title, description, category, teacher_id) VALUES (?, ?, ?, ?)',
            [title, description, category, teacherId]
        );

        res.status(201).json({
            message: 'Course created successfully',
            courseId: result.insertId
        });
    } catch (error) {
        console.error('Course creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update course details
router.put('/courses/:courseId', authenticateToken, teacherOnly, async (req, res) => {
    try {
        const db = req.db;
        const courseId = req.params.courseId;
        const { title, description, category, status } = req.body;
        const teacherId = req.user.userId;

        // Check if course belongs to teacher
        const [course] = await db.execute(
            'SELECT id FROM courses WHERE id = ? AND teacher_id = ?',
            [courseId, teacherId]
        );

        if (course.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await db.execute(
            'UPDATE courses SET title = ?, description = ?, category = ?, status = ? WHERE id = ?',
            [title, description, category, status, courseId]
        );

        res.json({ message: 'Course updated successfully' });
    } catch (error) {
        console.error('Course update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Upload course materials
router.post('/courses/:courseId/materials', authenticateToken, teacherOnly, async (req, res) => {
    try {
        const courseId = req.params.courseId;
        const teacherId = req.user.userId;

        // Check ownership (would need to implement materials table)
        // For now, return success response
        res.json({ message: 'Material upload endpoint - needs materials table implementation' });
    } catch (error) {
        console.error('Material upload error:', error);
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
router.get('/tasks/:userId', authenticateToken, teacherOnly, async (req, res) => {
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

// Grade student submissions
router.post('/tasks/:taskId/grade', authenticateToken, teacherOnly, async (req, res) => {
    try {
        const db = req.db;
        const taskId = req.params.taskId;
        const { grade, feedback } = req.body;
        const teacherId = req.user.userId;

        // Verify task belongs to teacher's course
        const [task] = await db.execute(`
            SELECT t.id FROM tasks t
            JOIN courses c ON t.course_id = c.id
            WHERE t.id = ? AND c.teacher_id = ?
        `, [taskId, teacherId]);

        if (task.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // This would need a submissions table to implement properly
        res.json({ 
            message: 'Grading endpoint - needs submissions table implementation',
            taskId,
            grade,
            feedback
        });
    } catch (error) {
        console.error('Task grading error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get teacher's library (uploaded materials)
router.get('/library/:userId', authenticateToken, teacherOnly, async (req, res) => {
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
router.get('/analytics/:userId', authenticateToken, teacherOnly, async (req, res) => {
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
                DATE(ce.updated_at) as date,
                COUNT(CASE WHEN ce.status = 'completed' THEN 1 END) as completions
            FROM course_enrollments ce
            JOIN courses c ON ce.course_id = c.id
            WHERE c.teacher_id = ? AND ce.status = 'completed' AND ce.updated_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(ce.updated_at)
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
                COUNT(CASE WHEN ce.status = 'completed' AND ce.updated_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as recent_completions
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
