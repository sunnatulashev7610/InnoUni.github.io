const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');

const PAGE = 50;
const MAX_BODY = 2000;

// My groups (any role)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [rows] = await req.db.execute(`
            SELECT g.id, g.name, g.description, g.course_id, gm.role,
                (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members
            FROM group_members gm
            JOIN \`groups\` g ON g.id = gm.group_id
            WHERE gm.user_id = ?
            ORDER BY g.id DESC
            LIMIT 100
        `, [req.user.userId]);
        res.json({ groups: rows.map((g) => ({ id: g.id, name: g.name, description: g.description, courseId: g.course_id, role: g.role, members: Number(g.members) || 0 })) });
    } catch (error) {
        console.error('My groups error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Everything below needs membership of the group in :groupId
async function memberOnly(req, res, next) {
    const groupId = parseId(req.params.groupId);
    if (!groupId) return res.status(400).json({ error: 'Invalid group id' });
    try {
        const [rows] = await req.db.execute('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, req.user.userId]);
        if (rows.length === 0) return res.status(403).json({ error: 'You are not a member of this group' });
        req.groupId = groupId;
        req.groupRole = rows[0].role;
        next();
    } catch (error) {
        console.error('Group membership error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Group info, members and my role
router.get('/:groupId', authenticateToken, memberOnly, async (req, res) => {
    try {
        const [g] = await req.db.execute('SELECT id, name, description, course_id FROM `groups` WHERE id = ?', [req.groupId]);
        if (g.length === 0) return res.status(404).json({ error: 'Group not found' });
        const [members] = await req.db.execute(
            "SELECT u.id, u.full_name, gm.role FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? ORDER BY gm.role = 'leader' DESC, u.full_name LIMIT 500",
            [req.groupId]
        );
        res.json({ group: { id: g[0].id, name: g[0].name, description: g[0].description, courseId: g[0].course_id }, role: req.groupRole, members });
    } catch (error) {
        console.error('Group detail error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Discussion: newest first, `before` = id of the oldest post already shown
router.get('/:groupId/posts', authenticateToken, memberOnly, async (req, res) => {
    try {
        const before = req.query.before === undefined ? null : parseId(req.query.before);
        if (req.query.before !== undefined && !before) return res.status(400).json({ error: 'Invalid before' });
        const params = [req.groupId];
        let where = 'p.group_id = ?';
        if (before) { where += ' AND p.id < ?'; params.push(before); }
        const [rows] = await req.db.execute(`
            SELECT p.id, p.kind, p.body, p.created_at, p.user_id, u.full_name
            FROM group_posts p JOIN users u ON u.id = p.user_id
            WHERE ${where}
            ORDER BY p.id DESC
            LIMIT ${PAGE + 1}
        `, params);
        const more = rows.length > PAGE;
        res.json({ posts: rows.slice(0, PAGE), more });
    } catch (error) {
        console.error('Group posts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Write a message; only the leader (teacher) can post a "topic"
router.post('/:groupId/posts', authenticateToken, memberOnly, async (req, res) => {
    try {
        const body = validateText(req.body && req.body.body, { field: 'Message', maxLength: MAX_BODY });
        if (body.error) return res.status(400).json({ error: body.error });
        const kind = req.body.kind === undefined ? 'message' : req.body.kind;
        if (kind !== 'message' && kind !== 'topic') return res.status(400).json({ error: 'Kind must be message or topic' });
        if (kind === 'topic' && req.groupRole !== 'leader') return res.status(403).json({ error: 'Only the group leader can post a topic' });
        const [r] = await req.db.execute('INSERT INTO group_posts (group_id, user_id, kind, body) VALUES (?, ?, ?, ?)', [req.groupId, req.user.userId, kind, body.value]);
        res.status(201).json({ id: r.insertId });
    } catch (error) {
        console.error('Group post error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete: the author or the group leader
router.delete('/:groupId/posts/:postId', authenticateToken, memberOnly, async (req, res) => {
    const postId = parseId(req.params.postId);
    if (!postId) return res.status(400).json({ error: 'Invalid post id' });
    try {
        const [rows] = await req.db.execute('SELECT user_id FROM group_posts WHERE id = ? AND group_id = ?', [postId, req.groupId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Post not found' });
        if (rows[0].user_id !== req.user.userId && req.groupRole !== 'leader') return res.status(403).json({ error: 'You can only delete your own posts' });
        await req.db.execute('DELETE FROM group_posts WHERE id = ?', [postId]);
        res.json({ message: 'Deleted' });
    } catch (error) {
        console.error('Group post delete error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
