const express = require('express');
const router = express.Router();

// Get dashboard statistics for a user
router.get('/stats/:userId', async (req, res) => {
    try {
        const db = req.db;
        const userId = req.params.userId;

        // Get course statistics
        const [courseStats] = await db.execute(`
            SELECT 
                COUNT(DISTINCT ce.course_id) as active_courses,
                COUNT(CASE WHEN ce.status = 'completed' THEN 1 END) as completed_courses,
                ROUND(AVG(ce.progress), 2) as avg_progress,
                COUNT(CASE WHEN ce.enrolled_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as new_courses_this_week
            FROM course_enrollments ce
            WHERE ce.user_id = ? AND ce.status = 'active'
        `, [userId]);

        // Get task statistics
        const [taskStats] = await db.execute(`
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN t.status = 'pending' AND t.due_date <= CURDATE() THEN 1 END) as overdue_tasks,
                COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress_tasks,
                COUNT(CASE WHEN t.status = 'completed' AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as completed_this_week,
                COUNT(CASE WHEN t.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as due_this_week
            FROM tasks t
            WHERE t.assigned_to = ?
        `, [userId]);

        // Get group statistics
        const [groupStats] = await db.execute(`
            SELECT 
                COUNT(*) as active_groups,
                COUNT(CASE WHEN gm.role = 'leader' THEN 1 END) as groups_leading,
                COUNT(CASE WHEN gm.joined_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as new_groups_this_month
            FROM group_members gm
            JOIN groups g ON gm.group_id = g.id
            WHERE gm.user_id = ? AND g.status = 'active'
        `, [userId]);

        // Get learning streak
        const [streakData] = await db.execute(`
            SELECT 
                COUNT(*) as current_streak,
                MAX(study_date) as last_study_date
            FROM (
                SELECT DISTINCT DATE(created_at) as study_date
                FROM course_enrollments
                WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                ORDER BY study_date DESC
            ) as study_dates
            WHERE study_date >= DATE_SUB(CURDATE(), INTERVAL 28 DAY)
        `, [userId]);

        // Get achievement statistics
        const [achievementStats] = await db.execute(`
            SELECT 
                COUNT(*) as total_achievements,
                COUNT(CASE WHEN ua.earned_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as earned_this_month
            FROM user_achievements ua
            WHERE ua.user_id = ?
        `, [userId]);

        // Calculate learning hours (estimated based on course progress)
        const [learningHours] = await db.execute(`
            SELECT 
                SUM(CE.progress * 2) as estimated_hours
            FROM course_enrollments ce
            WHERE ce.user_id = ? AND ce.status = 'active'
        `, [userId]);

        const stats = {
            courses: {
                active: courseStats[0]?.active_courses || 0,
                completed: courseStats[0]?.completed_courses || 0,
                avg_progress: courseStats[0]?.avg_progress || 0,
                new_this_week: courseStats[0]?.new_courses_this_week || 0
            },
            tasks: {
                total: taskStats[0]?.total_tasks || 0,
                overdue: taskStats[0]?.overdue_tasks || 0,
                in_progress: taskStats[0]?.in_progress_tasks || 0,
                completed_this_week: taskStats[0]?.completed_this_week || 0,
                due_this_week: taskStats[0]?.due_this_week || 0
            },
            groups: {
                active: groupStats[0]?.active_groups || 0,
                leading: groupStats[0]?.groups_leading || 0,
                new_this_month: groupStats[0]?.new_groups_this_month || 0
            },
            learning: {
                current_streak: streakData[0]?.current_streak || 0,
                estimated_hours: Math.round(learningHours[0]?.estimated_hours || 0),
                last_study_date: streakData[0]?.last_study_date
            },
            achievements: {
                total: achievementStats[0]?.total_achievements || 0,
                earned_this_month: achievementStats[0]?.earned_this_month || 0
            }
        };

        res.json(stats);
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get recent activity for a user
router.get('/activity/:userId', async (req, res) => {
    try {
        const db = req.db;
        const userId = req.params.userId;
        const { limit = 10 } = req.query;

        // Get recent course enrollments
        const [courseActivity] = await db.execute(`
            SELECT 
                'course' as type,
                ce.enrolled_at as timestamp,
                c.title as title,
                'enrolled' as action
            FROM course_enrollments ce
            JOIN courses c ON ce.course_id = c.id
            WHERE ce.user_id = ?
            ORDER BY ce.enrolled_at DESC
            LIMIT ?
        `, [userId, parseInt(limit)]);

        // Get recent task completions
        const [taskActivity] = await db.execute(`
            SELECT 
                'task' as type,
                t.updated_at as timestamp,
                t.title as title,
                t.status as action
            FROM tasks t
            WHERE t.assigned_to = ? AND t.status = 'completed'
            ORDER BY t.updated_at DESC
            LIMIT ?
        `, [userId, parseInt(limit)]);

        // Get recent group joins
        const [groupActivity] = await db.execute(`
            SELECT 
                'group' as type,
                gm.joined_at as timestamp,
                g.name as title,
                'joined' as action
            FROM group_members gm
            JOIN groups g ON gm.group_id = g.id
            WHERE gm.user_id = ?
            ORDER BY gm.joined_at DESC
            LIMIT ?
        `, [userId, parseInt(limit)]);

        // Get recent achievements
        const [achievementActivity] = await db.execute(`
            SELECT 
                'achievement' as type,
                ua.earned_at as timestamp,
                a.title as title,
                'earned' as action
            FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.id
            WHERE ua.user_id = ?
            ORDER BY ua.earned_at DESC
            LIMIT ?
        `, [userId, parseInt(limit)]);

        // Combine and sort all activities
        const allActivities = [
            ...courseActivity.map(a => ({ ...a, icon: 'fa-graduation-cap', color: 'blue' })),
            ...taskActivity.map(a => ({ ...a, icon: 'fa-check-circle', color: 'green' })),
            ...groupActivity.map(a => ({ ...a, icon: 'fa-user-plus', color: 'purple' })),
            ...achievementActivity.map(a => ({ ...a, icon: 'fa-trophy', color: 'yellow' }))
        ];

        // Sort by timestamp
        allActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Take the most recent activities
        const recentActivities = allActivities.slice(0, parseInt(limit));

        res.json(recentActivities);
    } catch (error) {
        console.error('Activity error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get learning progress over time
router.get('/progress/:userId', async (req, res) => {
    try {
        const db = req.db;
        const userId = req.params.userId;
        const { days = 30 } = req.query;

        const [progressData] = await db.execute(`
            SELECT 
                DATE(enrolled_at) as date,
                COUNT(*) as courses_enrolled,
                AVG(progress) as avg_progress
            FROM course_enrollments
            WHERE user_id = ? AND enrolled_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(enrolled_at)
            ORDER BY date ASC
        `, [userId, parseInt(days)]);

        res.json(progressData);
    } catch (error) {
        console.error('Progress error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get quick actions/recommendations
router.get('/recommendations/:userId', async (req, res) => {
    try {
        const db = req.db;
        const userId = req.params.userId;

        // Get overdue tasks
        const [overdueTasks] = await db.execute(`
            SELECT t.id, t.title, t.due_date
            FROM tasks t
            WHERE t.assigned_to = ? AND t.status = 'pending' AND t.due_date < CURDATE()
            ORDER BY t.due_date ASC
            LIMIT 3
        `, [userId]);

        // Get recommended courses based on enrolled courses
        const [recommendedCourses] = await db.execute(`
            SELECT DISTINCT c.id, c.title, c.category
            FROM courses c
            WHERE c.id NOT IN (
                SELECT course_id FROM course_enrollments WHERE user_id = ?
            )
            AND c.status = 'active'
            ORDER BY RAND()
            LIMIT 3
        `, [userId]);

        // Get groups the user can join
        const [availableGroups] = await db.execute(`
            SELECT g.id, g.name, g.description, COUNT(gm.user_id) as member_count
            FROM groups g
            LEFT JOIN group_members gm ON g.id = gm.group_id
            WHERE g.status = 'active' 
            AND g.id NOT IN (
                SELECT group_id FROM group_members WHERE user_id = ?
            )
            GROUP BY g.id
            HAVING member_count < 10
            ORDER BY member_count DESC
            LIMIT 3
        `, [userId]);

        res.json({
            overdue_tasks: overdueTasks,
            recommended_courses: recommendedCourses,
            available_groups: availableGroups
        });
    } catch (error) {
        console.error('Recommendations error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
