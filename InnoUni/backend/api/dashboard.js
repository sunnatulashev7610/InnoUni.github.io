const express = require('express');
const router = express.Router();
const { requireSelf } = require('../middleware/roleBased');

// All routes here are mounted behind authenticateToken (see server.js);
// requireSelf makes sure users only read their own data.

// Get recent activity for a user
router.get('/activity/:userId', requireSelf(), async (req, res) => {
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
                t.created_at as timestamp,
                t.title as title,
                t.status as action
            FROM tasks t
            WHERE t.assigned_to = ? AND t.status = 'completed'
            ORDER BY t.created_at DESC
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
            JOIN \`groups\` g ON gm.group_id = g.id
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

module.exports = router;
