const express = require('express');
const { authenticateToken, adminOnly, invalidateUserCache } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');

const battles = require('./battles');
const { BATTLE_LIMITS } = require('../utils/battleLimits');

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
        const [extra] = await req.db.execute(
            'SELECT (SELECT COUNT(*) FROM courses) AS courses, (SELECT COUNT(*) FROM users WHERE email_verified = 0) AS unverified, (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS new_week');
        const by = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], Number(r.n)]));
        const users = by(roles, 'role');
        res.json({
            users: { student: 0, teacher: 0, admin: 0, ...users },
            orders: { pending: 0, confirmed: 0, rejected: 0, ...by(orders, 'status') },
            teams: Number(teams[0]?.n || 0),
            courses: Number(extra[0]?.courses || 0),
            unverified: Number(extra[0]?.unverified || 0),
            new_week: Number(extra[0]?.new_week || 0)
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
            `SELECT id, full_name, email, role, blocked, email_verified, created_at FROM users${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 200`, params);
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
        invalidateUserCache(id); // the change applies to this user's open sessions at once
        await log(req.db, req.user.userId, 'set_role', id, req.body.role);
        res.json({ id, role: req.body.role });
    } catch (e) { fail(res, e); }
});

// Block or unblock. Takes effect at once: every request re-checks the account.
router.post('/users/:id/block', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    if (typeof req.body.blocked !== 'boolean') return res.status(400).json({ error: 'blocked must be true or false' });
    if (id === req.user.userId) return res.status(400).json({ error: 'You cannot block yourself' });
    try {
        const [r] = await req.db.execute('UPDATE users SET blocked = ? WHERE id = ?', [req.body.blocked ? 1 : 0, id]);
        if (!r.affectedRows) return res.status(404).json({ error: 'User not found' });
        invalidateUserCache(id);
        await log(req.db, req.user.userId, req.body.blocked ? 'block' : 'unblock', id, null);
        res.json({ id, blocked: req.body.blocked });
    } catch (e) { fail(res, e); }
});

// The latest admin actions (who did what to whom)
router.get('/log', async (req, res) => {
    try {
        const [rows] = await req.db.execute(
            'SELECT l.id, l.action, l.detail, l.created_at, a.full_name AS admin, t.full_name AS target FROM admin_log l LEFT JOIN users a ON a.id = l.admin_id LEFT JOIN users t ON t.id = l.target_user_id ORDER BY l.id DESC LIMIT 15');
        res.json({ log: rows });
    } catch (e) { fail(res, e); }
});

router.get('/teams', async (req, res) => {
    try {
        const [teams] = await req.db.execute(
            'SELECT t.id, t.name, t.topics_done, t.achievements, u.full_name AS captain, (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id AND m.status = \'active\') AS members FROM teams t JOIN users u ON t.captain_id = u.id ORDER BY t.id DESC');
        res.json({ teams });
    } catch (e) { fail(res, e); }
});

// All orders, optional ?status= and ?kind=. Only tariff orders are decided here; the rest are answered by teachers.
router.get('/orders', async (req, res) => {
    const { status, kind } = req.query;
    if (status && !['pending', 'offered', 'confirmed', 'rejected', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (kind && !['course', 'material', 'tariff'].includes(kind)) return res.status(400).json({ error: 'Invalid kind' });
    try {
        const where = []; const params = [];
        if (status) { where.push('o.status = ?'); params.push(status); }
        if (kind) { where.push('o.kind = ?'); params.push(kind); }
        const [orders] = await req.db.execute(
            `SELECT o.id, o.kind, o.item_title, o.note, o.price, o.reply, o.status, o.created_at, u.full_name FROM orders o JOIN users u ON o.user_id = u.id${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 200`,
            params);
        res.json({ orders });
    } catch (e) { fail(res, e); }
});

// Confirm or reject a tariff order
router.post('/orders/:id/decision', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order id' });
    if (!['confirmed', 'rejected'].includes(req.body.status)) return res.status(400).json({ error: 'Status must be confirmed or rejected' });
    const reply = validateText(req.body.reply, { field: 'Reply', required: false, maxLength: 1000 });
    if (reply.error) return res.status(400).json({ error: reply.error });
    try {
        const [r] = await req.db.execute(
            'UPDATE orders SET status = ?, reply = ?, handled_by = ? WHERE id = ? AND kind = \'tariff\' AND status = \'pending\'',
            [req.body.status, reply.value, req.user.userId, id]);
        if (!r.affectedRows) return res.status(404).json({ error: 'No pending tariff order with this id' });
        await log(req.db, req.user.userId, 'order_' + req.body.status, null, 'order #' + id);
        res.json({ id, status: req.body.status });
    } catch (e) { fail(res, e); }
});

// ---- Project battles: the platform judge scores what the teams handed in ----
const holes = (list) => list.map(() => '?').join(', ');

router.get('/battles', async (req, res) => {
    try {
        // Project battles whose time is up move to "judging" the first time someone looks
        const [open] = await req.db.execute("SELECT id FROM battles WHERE kind = 'project' AND status = 'active'", []);
        await battles.finalizeDue(req.db, open.map((b) => b.id));
        const [list] = await req.db.execute("SELECT id, title, topic, host_team_id, ends_at FROM battles WHERE kind = 'project' AND status = 'judging' ORDER BY id", []);
        if (!list.length) return res.json({ battles: [], max_score: BATTLE_LIMITS.maxJudgeScore });
        const ids = list.map((b) => b.id);
        const [teams] = await req.db.execute(`SELECT bt.battle_id, bt.team_id, t.name FROM battle_teams bt JOIN teams t ON t.id = bt.team_id WHERE bt.state IN ('host', 'accepted') AND bt.battle_id IN (${holes(ids)})`, ids);
        const [subs] = await req.db.execute(`SELECT battle_id, team_id, link, note FROM battle_submissions WHERE battle_id IN (${holes(ids)})`, ids);
        const [scores] = await req.db.execute(`SELECT battle_id, team_id, score, comment FROM battle_scores WHERE battle_id IN (${holes(ids)})`, ids);
        res.json({
            max_score: BATTLE_LIMITS.maxJudgeScore,
            battles: list.map((b) => ({
                id: b.id, title: b.title, topic: b.topic, ends_at: b.ends_at,
                teams: teams.filter((t) => t.battle_id === b.id).map((t) => {
                    const sub = subs.find((x) => x.battle_id === b.id && x.team_id === t.team_id);
                    const sc = scores.find((x) => x.battle_id === b.id && x.team_id === t.team_id);
                    return { team_id: t.team_id, name: t.name, submission: sub ? { link: sub.link, note: sub.note } : null, score: sc ? sc.score : null, comment: sc ? sc.comment : null };
                })
            }))
        });
    } catch (e) { fail(res, e); }
});

async function judgingBattle(req, res) {
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid battle id' }); return null; }
    const [rows] = await req.db.execute('SELECT id, status, kind FROM battles WHERE id = ?', [id]);
    if (!rows[0] || rows[0].kind !== 'project') { res.status(404).json({ error: 'Battle not found' }); return null; }
    if (rows[0].status !== 'judging') { res.status(409).json({ error: 'This battle is not waiting for the judge' }); return null; }
    return rows[0];
}

router.post('/battles/:id/score', async (req, res) => {
    try {
        const battle = await judgingBattle(req, res);
        if (!battle) return;
        const teamId = parseId(req.body && req.body.team_id);
        const score = req.body && req.body.score;
        if (!teamId) return res.status(400).json({ error: 'Choose a team' });
        if (!Number.isInteger(score) || score < 0 || score > BATTLE_LIMITS.maxJudgeScore) return res.status(400).json({ error: `Score must be a whole number from 0 to ${BATTLE_LIMITS.maxJudgeScore}` });
        const comment = validateText(req.body.comment, { field: 'Comment', required: false, maxLength: 300 });
        if (comment.error) return res.status(400).json({ error: comment.error });
        const [has] = await req.db.execute('SELECT team_id FROM battle_submissions WHERE battle_id = ? AND team_id = ?', [battle.id, teamId]);
        if (!has.length) return res.status(404).json({ error: 'This team has not handed in a project' });
        await req.db.execute('INSERT INTO battle_scores (battle_id, team_id, score, comment, judge_id) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE score = VALUES(score), comment = VALUES(comment), judge_id = VALUES(judge_id)',
            [battle.id, teamId, score, comment.value || null, req.user.userId]);
        res.json({ saved: true });
    } catch (e) { fail(res, e); }
});

// Closing needs a score for every team that handed in; teams that handed in nothing get 0
router.post('/battles/:id/finish', async (req, res) => {
    try {
        const battle = await judgingBattle(req, res);
        if (!battle) return;
        const [playing] = await req.db.execute("SELECT team_id, state FROM battle_teams WHERE battle_id = ? AND state IN ('host', 'accepted')", [battle.id]);
        const [subs] = await req.db.execute(`SELECT battle_id, team_id, link, note FROM battle_submissions WHERE battle_id IN (${holes([battle.id])})`, [battle.id]);
        const [scores] = await req.db.execute(`SELECT battle_id, team_id, score, comment FROM battle_scores WHERE battle_id IN (${holes([battle.id])})`, [battle.id]);
        const table = [];
        for (const t of playing) {
            const handed = subs.some((x) => x.team_id === t.team_id);
            const sc = scores.find((x) => x.team_id === t.team_id);
            if (handed && !sc) return res.status(400).json({ error: 'Score every team that handed in a project first' });
            const score = handed ? Number(sc.score) : 0;
            table.push({ team_id: t.team_id, score, total: score, people: handed ? 1 : 0 });
        }
        await battles.closeBattle(req.db, battle.id, battles.rankTable(table), 'judging');
        res.json({ status: 'finished' });
    } catch (e) { fail(res, e); }
});

module.exports = router;
