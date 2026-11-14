// Team chat. Mounted at /api/teams/:id/messages (see teams.js, which already requires a login).
// Only active members can read or write. The admin (the person who opened the team) can delete messages.
const express = require('express');
const { parseId, validateText } = require('../utils/validation');
const { LIMITS, FLOOD } = require('../utils/teamLimits');
const { getTeam, getMember } = require('../utils/teamAccess');

const router = express.Router({ mergeParams: true });
const PAGE = 50;

async function memberOnly(req, res, next) {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const team = await getTeam(req.db, teamId);
        if (!team) return res.status(404).json({ error: 'Team not found' });
        const member = await getMember(req.db, teamId, req.user.userId);
        if (!member || member.status !== 'active') return res.status(403).json({ error: 'Only team members can use the chat' });
        req.team = team;
        req.member = member;
        req.isAdmin = team.captain_id === req.user.userId;
        next();
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
}
router.use(memberOnly);

// Members who chose to hide their name show as "Anonim" to everyone but the admin
const shape = (req) => (m) => {
    const hidden = Boolean(Number(m.anonymous)) && !req.isAdmin;
    return {
        id: m.id,
        body: m.body,
        created_at: m.created_at,
        mine: m.user_id === req.user.userId,
        user_id: hidden ? null : m.user_id,
        name: hidden ? 'Anonim' : m.full_name,
        is_admin: m.user_id === req.team.captain_id
    };
};

const SELECT =
    'SELECT m.id, m.user_id, m.body, m.created_at, u.full_name, tm.anonymous ' +
    'FROM team_messages m JOIN users u ON u.id = m.user_id ' +
    'LEFT JOIN team_members tm ON tm.team_id = m.team_id AND tm.user_id = m.user_id ' +
    'WHERE m.team_id = ? AND m.deleted_at IS NULL';

// Latest messages (no query), older ones (?before=id) or only new ones (?after=id).
// ?from=id also lists which messages from that id on were deleted, so open chats can drop them.
router.get('/', async (req, res) => {
    try {
        const teamId = req.team.id;
        const before = parseId(req.query.before);
        const after = parseId(req.query.after);
        const from = parseId(req.query.from);
        let rows;
        let more = false;
        if (after) {
            [rows] = await req.db.execute(SELECT + ' AND m.id > ? ORDER BY m.id ASC LIMIT 100', [teamId, after]);
        } else {
            const [found] = before
                ? await req.db.execute(SELECT + ` AND m.id < ? ORDER BY m.id DESC LIMIT ${PAGE + 1}`, [teamId, before])
                : await req.db.execute(SELECT + ` ORDER BY m.id DESC LIMIT ${PAGE + 1}`, [teamId]);
            more = found.length > PAGE;
            rows = found.slice(0, PAGE).reverse();
        }
        let deleted = [];
        if (from) {
            const [gone] = await req.db.execute('SELECT id FROM team_messages WHERE team_id = ? AND deleted_at IS NOT NULL AND id >= ?', [teamId, from]);
            deleted = gone.map((g) => g.id);
        }
        res.json({
            messages: rows.map(shape(req)),
            deleted,
            more,
            me: { is_admin: req.isAdmin, muted: req.member.muted && !req.isAdmin, muted_seconds: req.isAdmin ? 0 : req.member.muted_seconds },
            limits: { maxMessageLength: LIMITS.maxMessageLength }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send a message
router.post('/', async (req, res) => {
    const body = validateText(req.body.body, { field: 'Message', maxLength: LIMITS.maxMessageLength });
    if (body.error) return res.status(400).json({ error: body.error });
    try {
        const teamId = req.team.id;
        const userId = req.user.userId;
        if (!req.isAdmin) {
            if (req.member.muted) {
                return res.status(403).json({ error: 'You are restricted from writing for now', muted_seconds: req.member.muted_seconds });
            }
            const [recent] = await req.db.execute(
                'SELECT COUNT(*) AS n FROM team_messages WHERE team_id = ? AND user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)',
                [teamId, userId, FLOOD.windowSeconds]
            );
            if (Number(recent[0].n) >= FLOOD.messages) {
                await req.db.execute(
                    "UPDATE team_members SET muted_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE team_id = ? AND user_id = ? AND status = 'active'",
                    [FLOOD.muteMinutes, teamId, userId]
                );
                return res.status(429).json({ error: 'Too many messages. You are restricted from writing for a few minutes', muted_seconds: FLOOD.muteMinutes * 60 });
            }
        }
        const [result] = await req.db.execute('INSERT INTO team_messages (team_id, user_id, body) VALUES (?, ?, ?)', [teamId, userId, body.value]);
        res.status(201).json({
            message: {
                id: result.insertId,
                body: body.value,
                created_at: new Date().toISOString(),
                mine: true,
                user_id: userId,
                name: null,
                is_admin: req.isAdmin
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin only: delete a message (its text is wiped)
router.delete('/:messageId', async (req, res) => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Only the admin can delete messages' });
    const messageId = parseId(req.params.messageId);
    if (!messageId) return res.status(400).json({ error: 'Invalid message id' });
    try {
        const [r] = await req.db.execute("UPDATE team_messages SET deleted_at = NOW(), body = '' WHERE id = ? AND team_id = ? AND deleted_at IS NULL", [messageId, req.team.id]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Message not found' });
        res.json({ message: 'Deleted' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
