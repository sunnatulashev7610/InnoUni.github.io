const express = require('express');
const router = express.Router();
const { studentOnly, authenticateToken } = require('../middleware/roleBased');

// Get student dashboard data
router.get('/dashboard/:userId', authenticateToken, studentOnly, async (req, res) => {
    try {
        const db = req.db;
        const userId = req.params.userId;

        // Get enrolled courses with progress
        const [courses] = await db.execute(`
            SELECT 
                c.id, c.title, c.description, c.category, c.avatar,
                ce.progress, ce.enrolled_at, ce.status as enrollment_status,
                u.full_name as teacher_name,
                COUNT(t.id) as pending_tasks,
                COUNT(CASE WHEN t.due_date <= CURDATE() AND t.status = 'pending' THEN 1 END) as overdue_tasks
            FROM course_enrollments ce
            JOIN courses c ON ce.course_id = c.id
            LEFT JOIN users u ON c.teacher_id = u.id
            LEFT JOIN tasks t ON c.id = t.course_id AND t.assigned_to = ce.user_id
            WHERE ce.user_id = ? AND ce.status = 'active'
            GROUP BY c.id, ce.progress, ce.enrolled_at, ce.status, u.full_name
            ORDER BY ce.enrolled_at DESC
        `, [userId]);

        // Get student's groups
        const [groups] = await db.execute(`
            SELECT 
                g.id, g.name, g.description, g.logo, g.status,
                gm.role as student_role, gm.joined_at,
                COUNT(gm2.user_id) as total_members,
                COUNT(p.id) as active_projects
            FROM group_members gm
            JOIN groups g ON gm.group_id = g.id
            LEFT JOIN group_members gm2 ON g.id = gm2.group_id
            LEFT JOIN projects p ON g.id = p.group_id AND p.status = 'active'
            WHERE gm.user_id = ? AND g.status = 'active'
            GROUP BY g.id, gm.role, gm.joined_at
            ORDER BY gm.joined_at DESC
        `, [userId]);

        // Get student's tasks
        const [tasks] = await db.execute(`
            SELECT 
                t.id, t.title, t.description, t.priority, t.status, t.due_date,
                c.title as course_title,
                DATEDIFF(t.due_date, CURDATE()) as days_until_due
            FROM tasks t
            LEFT JOIN courses c ON t.course_id = c.id
            WHERE t.assigned_to = ?
            ORDER BY 
                CASE 
                    WHEN t.status = 'pending' AND t.due_date < CURDATE() THEN 1
                    WHEN t.status = 'in_progress' THEN 2
                    WHEN t.status = 'pending' THEN 3
                    ELSE 4
                END,
                t.due_date ASC
        `, [userId]);

        // Get student achievements
        const [achievements] = await db.execute(`
            SELECT 
                a.id, a.title, a.description, a.icon, a.type,
                ua.earned_at
            FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.id
            WHERE ua.user_id = ?
            ORDER BY ua.earned_at DESC
            LIMIT 10
        `, [userId]);

        // Get learning statistics
        const [stats] = await db.execute(`
            SELECT 
                COUNT(DISTINCT ce.course_id) as enrolled_courses,
                COUNT(CASE WHEN ce.status = 'completed' THEN 1 END) as completed_courses,
                ROUND(AVG(ce.progress), 2) as avg_progress,
                COUNT(DISTINCT gm.group_id) as active_groups,
                COUNT(DISTINCT ua.achievement_id) as total_achievements,
                SUM(CE.progress * 2) as estimated_study_hours,
                (
                    SELECT COUNT(*) 
                    FROM (
                        SELECT DISTINCT DATE(created_at) as study_date
                        FROM course_enrollments
                        WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                    ) as dates
                    WHERE study_date >= DATE_SUB(CURDATE(), INTERVAL 28 DAY)
                ) as current_streak
            FROM users u
            LEFT JOIN course_enrollments ce ON u.id = ce.user_id AND ce.status = 'active'
            LEFT JOIN group_members gm ON u.id = gm.user_id
            LEFT JOIN user_achievements ua ON u.id = ua.user_id
            WHERE u.id = ?
        `, [userId, userId]);

        // Get recommended courses
        const [recommendedCourses] = await db.execute(`
            SELECT 
                c.id, c.title, c.description, c.category, c.avatar,
                u.full_name as teacher_name,
                COUNT(ce.user_id) as enrolled_students
            FROM courses c
            LEFT JOIN users u ON c.teacher_id = u.id
            LEFT JOIN course_enrollments ce ON c.id = ce.course_id AND ce.status = 'active'
            WHERE c.status = 'active' 
            AND c.id NOT IN (
                SELECT course_id FROM course_enrollments WHERE user_id = ?
            )
            GROUP BY c.id
            ORDER BY enrolled_students DESC, RAND()
            LIMIT 5
        `, [userId]);

        // Get available groups to join
        const [availableGroups] = await db.execute(`
            SELECT 
                g.id, g.name, g.description, g.logo,
                COUNT(gm.user_id) as current_members,
                COUNT(p.id) as active_projects
            FROM groups g
            LEFT JOIN group_members gm ON g.id = gm.group_id
            LEFT JOIN projects p ON g.id = p.group_id AND p.status = 'active'
            WHERE g.status = 'active' 
            AND g.id NOT IN (
                SELECT group_id FROM group_members WHERE user_id = ?
            )
            GROUP BY g.id
            HAVING current_members < 10
            ORDER BY current_members ASC
            LIMIT 5
        `, [userId]);

        res.json({
            courses,
            groups,
            tasks,
            achievements,
            stats: stats[0],
            recommendedCourses,
            availableGroups
        });
    } catch (error) {
        console.error('Student dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Enroll in a course
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
            'SELECT id FROM courses WHERE id = ? AND status = "active"',
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

        res.json({ message: 'Successfully enrolled in course' });
    } catch (error) {
        console.error('Course enrollment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a new student group
router.post('/groups', authenticateToken, studentOnly, async (req, res) => {
    try {
        const db = req.db;
        const { name, description } = req.body;
        const createdBy = req.user.userId;

        // Validate input
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Group name is required' });
        }

        // Create group
        const [result] = await db.execute(
            'INSERT INTO groups (name, description, created_by) VALUES (?, ?, ?)',
            [name.trim(), description, createdBy]
        );

        // Add creator as group leader
        await db.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [result.insertId, createdBy, 'leader']
        );

        res.status(201).json({
            message: 'Group created successfully',
            groupId: result.insertId
        });
    } catch (error) {
        console.error('Group creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Join a group
router.post('/groups/:groupId/join', authenticateToken, studentOnly, async (req, res) => {
    try {
        const db = req.db;
        const groupId = req.params.groupId;
        const userId = req.user.userId;

        // Check if already a member
        const [existing] = await db.execute(
            'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
            [groupId, userId]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Already a member of this group' });
        }

        // Check if group exists and is active
        const [group] = await db.execute(
            'SELECT id FROM groups WHERE id = ? AND status = "active"',
            [groupId]
        );

        if (group.length === 0) {
            return res.status(404).json({ error: 'Group not found or inactive' });
        }

        // Check group member limit
        const [memberCount] = await db.execute(
            'SELECT COUNT(*) as count FROM group_members WHERE group_id = ?',
            [groupId]
        );

        if (memberCount[0].count >= 10) {
            return res.status(400).json({ error: 'Group is full' });
        }

        // Join group
        await db.execute(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [groupId, userId, 'member']
        );

        res.json({ message: 'Successfully joined group' });
    } catch (error) {
        console.error('Join group error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Leave a group
router.post('/groups/:groupId/leave', authenticateToken, studentOnly, async (req, res) => {
    try {
        const db = req.db;
        const groupId = req.params.groupId;
        const userId = req.user.userId;

        // Check if member
        const [member] = await db.execute(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
            [groupId, userId]
        );

        if (member.length === 0) {
            return res.status(400).json({ error: 'Not a member of this group' });
        }

        // Check if leader (can't leave if only leader)
        if (member[0].role === 'leader') {
            const [otherMembers] = await db.execute(
                'SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND user_id != ?',
                [groupId, userId]
            );

            if (otherMembers[0].count === 0) {
                return res.status(400).json({ error: 'Group leader cannot leave if no other members' });
            }
        }

        // Leave group
        await db.execute(
            'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
            [groupId, userId]
        );

        res.json({ message: 'Successfully left group' });
    } catch (error) {
        console.error('Leave group error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update course progress
router.put('/courses/:courseId/progress', authenticateToken, studentOnly, async (req, res) => {
    try {
        const db = req.db;
        const courseId = req.params.courseId;
        const userId = req.user.userId;
        const { progress } = req.body;

        // Validate progress
        if (progress < 0 || progress > 100) {
            return res.status(400).json({ error: 'Progress must be between 0 and 100' });
        }

        // Check if enrolled
        const [enrollment] = await db.execute(
            'SELECT id FROM course_enrollments WHERE course_id = ? AND user_id = ?',
            [courseId, userId]
        );

        if (enrollment.length === 0) {
            return res.status(400).json({ error: 'Not enrolled in this course' });
        }

        // Update progress
        await db.execute(
            'UPDATE course_enrollments SET progress = ?, status = ? WHERE course_id = ? AND user_id = ?',
            [progress, progress >= 100 ? 'completed' : 'active', courseId, userId]
        );

        // Check for achievements
        await this.checkAchievements(userId, db);

        res.json({ message: 'Progress updated successfully' });
    } catch (error) {
        console.error('Progress update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
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

// Helper function to check and award achievements
async function checkAchievements(userId, db) {
    // Check for course completion achievements
    const [completedCourses] = await db.execute(
        'SELECT COUNT(*) as count FROM course_enrollments WHERE user_id = ? AND status = "completed"',
        [userId]
    );

    if (completedCourses[0].count >= 10) {
        await this.awardAchievement(userId, 4, db); // "Sertifikatli" achievement
    }

    // Check for task completion achievements
    const [completedTasks] = await db.execute(
        'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND status = "completed"',
        [userId]
    );

    if (completedTasks[0].count >= 100) {
        await this.awardAchievement(userId, 2, db); // "Kod ustasi" achievement
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
