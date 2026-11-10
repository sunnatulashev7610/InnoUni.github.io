const express = require('express');
const { authenticateToken, adminOnly } = require('../middleware/roleBased');
const { parseId } = require('../utils/validation');

const router = express.Router();
router.use(authenticateToken, adminOnly);

const ROLES = ['student', 'teacher', 'admin'];
const fail = (res, e) => { console.error(e); res.status(500).json({ error: 'Server error' }); };

async function log(db, adminId, action, targetId, detail) {
    await db.execute('INSERT INTO admin_log (admin_id, action, target_user_id, detail) VALUES (?, ?, ?, ?)', [adminId, action, targetId, detail]);
}

// Counts for the overview cards
router.get('/stats', async (req, res) => {
    try {
        const [roles] = await req.db.execute('SELECT role, COUNT(*) AS n FROM users GROUP BY role');
        const [orders] = await req.db.execute('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
        const [teams] = await req.db.execute('SELECT COUNT(*) AS n FROM teams');
        const by = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], Number(r.n)]));
        const users = by(roles, 'role');
        res.json({
            users: { student: 0, teacher: 0, admin: 0, ...users },
            orders: { pending: 0, confirmed: 0, rejected: 0, ...by(orders, 'status') },
            teams: Number(teams[0]?.n || 0)
        });
    } catch (e) { fail(res, e); }
});

// Users, newest first. Optional ?q= (name or email) and ?role=
router.get('/users', async (req, res) => {
    const { q, role } = req.query;
    if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const where = [];
    const params = [];
    if (role) { where.push('role = ?'); params.push(role); }
    if (typeof q === 'string' && q.trim()) {
        where.push('(full_name LIKE ? OR email LIKE ?)');
        const like = `%${q.trim().slice(0, 100)}%`;
        params.push(like, like);
    }
    try {
        const [users] = await req.db.execute(
            `SELECT id, full_name, email, role, blocked, created_at FROM users${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 200`, params);
        res.json({ users });
    } catch (e) { fail(res, e); }
});

// Change a role (not your own: an admin must not lock themselves out)
router.post('/users/:id/role', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    if (!ROLES.includes(req.body.role)) return res.status(400).json({ error: 'Invalid role' });
    if (id === req.user.userId) return res.status(400).json({ error: 'You cannot change your own role' });
    try {
        const [r] = await req.db.execute('UPDATE users SET role = ? WHERE id = ?', [req.body.role, id]);
        if (!r.affectedRows) return res.status(404).json({ error: 'User not found' });
        await log(req.db, req.user.userId, 'set_role', id, req.body.role);
        res.json({ id, role: req.body.role });
    } catch (e) { fail(res, e); }
});

// Block or unblock. Takes effect at the next login (tokens expire within 24h).
router.post('/users/:id/block', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    if (typeof req.body.blocked !== 'boolean') return res.status(400).json({ error: 'blocked must be true or false' });
    if (id === req.user.userId) return res.status(400).json({ error: 'You cannot block yourself' });
    try {
        const [r] = await req.db.execute('UPDATE users SET blocked = ? WHERE id = ?', [req.body.blocked ? 1 : 0, id]);
        if (!r.affectedRows) return res.status(404).json({ error: 'User not found' });
        await log(req.db, req.user.userId, req.body.blocked ? 'block' : 'unblock', id, null);
        res.json({ id, blocked: req.body.blocked });
    } catch (e) { fail(res, e); }
});

router.get('/teams', async (req, res) => {
    try {
        const [teams] = await req.db.execute(
            'SELECT t.id, t.name, t.topics_done, t.achievements, u.full_name AS captain, (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id AND m.status = \'active\') AS members FROM teams t JOIN users u ON t.captain_id = u.id ORDER BY t.id DESC');
        res.json({ teams });
    } catch (e) { fail(res, e); }
});

// All orders, optional ?status=
router.get('/orders', async (req, res) => {
    const { status } = req.query;
    if (status && !['pending', 'confirmed', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    try {
        const [orders] = await req.db.execute(
            `SELECT o.id, o.kind, o.item_title, o.amount, o.status, o.created_at, u.full_name FROM orders o JOIN users u ON o.user_id = u.id${status ? ' WHERE o.status = ?' : ''} ORDER BY o.id DESC LIMIT 200`,
            status ? [status] : []);
        res.json({ orders });
    } catch (e) { fail(res, e); }
});

module.exports = router;
