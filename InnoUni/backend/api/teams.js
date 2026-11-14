const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId, validateText, isValidEmail } = require('../utils/validation');
const { LIMITS, MUTE_MINUTES, INVITE_MODES } = require('../utils/teamLimits');
const { getTeam, getMember, countActive } = require('../utils/teamAccess');
const chatRouter = require('./teamChat');

const router = express.Router();
router.use(authenticateToken);

// Chat: /api/teams/:id/messages
router.use('/:id/messages', chatRouter);

// Rating: topics x2 + achievements x10
const rating = (t) => t.topics_done * 2 + t.achievements * 10;

// Directions a team can be opened in (also sent to the page, so the form and the API never disagree)
const DIRECTIONS = ['Dasturlash', 'Dizayn', 'Til', 'Fan', 'Biznes', 'Boshqa'];

// One team row with the automatic facts: who opened it (the admin), when, how many active members,
// the viewer's own status (and whether it is an invitation), and (admin only) how many requests are waiting.
const TEAM_SELECT =
    'SELECT t.id, t.name, t.description, t.direction, t.sphere, t.goals, t.captain_id, t.invite_mode, t.topics_done, t.achievements, t.created_at, ' +
    'c.full_name AS captain_name, ' +
    '(SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id AND m.status = \'active\') AS members, ' +
    '(SELECT m.status FROM team_members m WHERE m.team_id = t.id AND m.user_id = ?) AS my_status, ' +
    '(SELECT m.invited_by FROM team_members m WHERE m.team_id = t.id AND m.user_id = ?) AS my_invited_by, ' +
    '(SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id AND m.status = \'pending\' AND m.invited_by IS NULL AND t.captain_id = ?) AS pending_requests ' +
    'FROM teams t JOIN users c ON c.id = t.captain_id';

const shape = (t, userId) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    direction: t.direction,
    sphere: t.sphere,
    goals: t.goals,
    captain_id: t.captain_id,
    captain_name: t.captain_name,
    invite_mode: t.invite_mode || 'admin',
    created_at: t.created_at,
    members: Number(t.members),
    max_members: LIMITS.maxMembers,
    my_status: t.my_status || null,
    invited: t.my_status === 'pending' && t.my_invited_by !== null && t.my_invited_by !== undefined,
    is_captain: t.captain_id === userId,
    pending_requests: Number(t.pending_requests) || 0,
    topics_done: t.topics_done,
    achievements: t.achievements,
    rating: rating(t)
});

const serverError = (res, e) => {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
};

// List teams (newest first, then by rating) with the directions and limits the pages need
router.get('/', async (req, res) => {
    try {
        const uid = req.user.userId;
        const [rows] = await req.db.execute(TEAM_SELECT + ' ORDER BY t.id DESC', [uid, uid, uid]);
        const teams = rows.map((t) => shape(t, uid)).sort((a, b) => b.rating - a.rating);
        res.json({ teams, directions: DIRECTIONS, limits: LIMITS });
    } catch (e) {
        serverError(res, e);
    }
});

// One team
router.get('/:id', async (req, res) => {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const uid = req.user.userId;
        const [rows] = await req.db.execute(TEAM_SELECT + ' WHERE t.id = ?', [uid, uid, uid, teamId]);
        if (!rows.length) return res.status(404).json({ error: 'Team not found' });
        res.json({ team: shape(rows[0], uid), directions: DIRECTIONS, limits: LIMITS });
    } catch (e) {
        serverError(res, e);
    }
});

// Create a team: direction, sphere and goals are required. The creator becomes the admin and first member;
// who opened it, when and the member count are filled in by the server.
router.post('/', async (req, res) => {
    const name = validateText(req.body.name, { field: 'Name', maxLength: 100 });
    if (name.error) return res.status(400).json({ error: name.error });
    const direction = typeof req.body.direction === 'string' ? req.body.direction.trim() : '';
    if (!DIRECTIONS.includes(direction)) return res.status(400).json({ error: 'Direction must be one of: ' + DIRECTIONS.join(', ') });
    const sphere = validateText(req.body.sphere, { field: 'Sphere', maxLength: 100 });
    if (sphere.error) return res.status(400).json({ error: sphere.error });
    const goals = validateText(req.body.goals, { field: 'Goals', maxLength: 500 });
    if (goals.error) return res.status(400).json({ error: goals.error });
    const description = validateText(req.body.description, { field: 'Description', required: false, maxLength: 1000 });
    if (description.error) return res.status(400).json({ error: description.error });
    try {
        const [own] = await req.db.execute('SELECT COUNT(*) AS n FROM teams WHERE captain_id = ?', [req.user.userId]);
        if (Number(own[0].n) >= LIMITS.maxTeamsPerUser) return res.status(400).json({ error: `You can open at most ${LIMITS.maxTeamsPerUser} teams` });
        const [result] = await req.db.execute(
            'INSERT INTO teams (name, description, direction, sphere, goals, captain_id) VALUES (?, ?, ?, ?, ?, ?)',
            [name.value, description.value, direction, sphere.value, goals.value, req.user.userId]);
        await req.db.execute('INSERT INTO team_members (team_id, user_id, status) VALUES (?, ?, \'active\')', [result.insertId, req.user.userId]);
        res.status(201).json({ id: result.insertId });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Team name already taken' });
        serverError(res, e);
    }
});

// Admin only: team settings. Only the fields that are sent change.
router.put('/:id', async (req, res) => {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    const b = req.body || {};
    const updates = {};
    if (b.name !== undefined) {
        const v = validateText(b.name, { field: 'Name', maxLength: 100 });
        if (v.error) return res.status(400).json({ error: v.error });
        updates.name = v.value;
    }
    if (b.direction !== undefined) {
        const direction = typeof b.direction === 'string' ? b.direction.trim() : '';
        if (!DIRECTIONS.includes(direction)) return res.status(400).json({ error: 'Direction must be one of: ' + DIRECTIONS.join(', ') });
        updates.direction = direction;
    }
    if (b.sphere !== undefined) {
        const v = validateText(b.sphere, { field: 'Sphere', maxLength: 100 });
        if (v.error) return res.status(400).json({ error: v.error });
        updates.sphere = v.value;
    }
    if (b.goals !== undefined) {
        const v = validateText(b.goals, { field: 'Goals', maxLength: 500 });
        if (v.error) return res.status(400).json({ error: v.error });
        updates.goals = v.value;
    }
    if (b.description !== undefined) {
        const v = validateText(b.description, { field: 'Description', required: false, maxLength: 1000 });
        if (v.error) return res.status(400).json({ error: v.error });
        updates.description = v.value;
    }
    if (b.invite_mode !== undefined) {
        if (!INVITE_MODES.includes(b.invite_mode)) return res.status(400).json({ error: 'invite_mode must be one of: ' + INVITE_MODES.join(', ') });
        updates.invite_mode = b.invite_mode;
    }
    const columns = Object.keys(updates);
    if (!columns.length) return res.status(400).json({ error: 'Nothing to update' });
    try {
        const team = await getTeam(req.db, teamId);
        if (!team) return res.status(404).json({ error: 'Team not found' });
        if (team.captain_id !== req.user.userId) return res.status(403).json({ error: 'Only the admin can do this' });
        // Column names come from the fixed list above, never from the request
        await req.db.execute(`UPDATE teams SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...columns.map((c) => updates[c]), teamId]);
        const uid = req.user.userId;
        const [rows] = await req.db.execute(TEAM_SELECT + ' WHERE t.id = ?', [uid, uid, uid, teamId]);
        res.json({ team: shape(rows[0], uid) });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Team name already taken' });
        serverError(res, e);
    }
});

// Owner only: delete the team with its members and chat
router.delete('/:id', async (req, res) => {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const team = await getTeam(req.db, teamId);
        if (!team) return res.status(404).json({ error: 'Team not found' });
        if (team.captain_id !== req.user.userId) return res.status(403).json({ error: 'Only the owner can delete the team' });
        await req.db.execute('DELETE FROM teams WHERE id = ?', [teamId]);
        res.json({ message: 'Team deleted' });
    } catch (e) {
        serverError(res, e);
    }
});

// Ask to join (optionally anonymous)
router.post('/:id/join', async (req, res) => {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const team = await getTeam(req.db, teamId);
        if (!team) return res.status(404).json({ error: 'Team not found' });
        if (await getMember(req.db, teamId, req.user.userId)) return res.status(409).json({ error: 'Already requested or a member' });
        if (await countActive(req.db, teamId) >= LIMITS.maxMembers) return res.status(400).json({ error: 'Team is full' });
        await req.db.execute('INSERT INTO team_members (team_id, user_id, status, anonymous) VALUES (?, ?, \'pending\', ?)', [teamId, req.user.userId, req.body.anonymous ? 1 : 0]);
        res.status(201).json({ message: 'Request sent' });
    } catch (e) {
        serverError(res, e);
    }
});

// Leave the team, or withdraw my own request. The admin cannot leave: they delete the team instead.
router.post('/:id/leave', async (req, res) => {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const team = await getTeam(req.db, teamId);
        if (!team) return res.status(404).json({ error: 'Team not found' });
        if (team.captain_id === req.user.userId) return res.status(400).json({ error: 'The admin cannot leave; delete the team instead' });
        const [r] = await req.db.execute('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, req.user.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'You are not in this team' });
        res.json({ message: 'Left' });
    } catch (e) {
        serverError(res, e);
    }
});

// Members. Anonymous ones show as "Anonim" to everyone but the admin; pending requests, invitations and
// restrictions are for the admin only.
router.get('/:id/members', async (req, res) => {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const team = await getTeam(req.db, teamId);
        if (!team) return res.status(404).json({ error: 'Team not found' });
        const isCaptain = team.captain_id === req.user.userId;
        const [rows] = await req.db.execute(
            'SELECT m.user_id, m.status, m.anonymous, m.invited_by, ' +
            'IFNULL(GREATEST(TIMESTAMPDIFF(SECOND, NOW(), m.muted_until), 0), 0) AS muted_seconds, u.full_name ' +
            'FROM team_members m JOIN users u ON m.user_id = u.id WHERE m.team_id = ? ORDER BY m.id', [teamId]);
        const members = rows
            .filter((m) => isCaptain || m.status === 'active')
            .map((m) => {
                const hidden = Boolean(Number(m.anonymous)) && !isCaptain;
                return {
                    user_id: hidden ? null : m.user_id,
                    name: hidden ? 'Anonim' : m.full_name,
                    status: m.status,
                    is_admin: m.user_id === team.captain_id,
                    invited: m.invited_by !== null && m.invited_by !== undefined,
                    muted_seconds: isCaptain ? Number(m.muted_seconds) || 0 : 0
                };
            });
        const me = await getMember(req.db, teamId, req.user.userId);
        res.json({
            members,
            isCaptain,
            invite_mode: team.invite_mode || 'admin',
            limits: LIMITS,
            me: me ? { status: me.status, invited: me.invited, muted: me.muted, muted_seconds: me.muted_seconds } : null
        });
    } catch (e) {
        serverError(res, e);
    }
});

async function captainOf(req, res) {
    const teamId = parseId(req.params.id);
    const userId = parseId(req.params.userId);
    if (!teamId || !userId) { res.status(400).json({ error: 'Invalid id' }); return null; }
    const team = await getTeam(req.db, teamId);
    if (!team) { res.status(404).json({ error: 'Team not found' }); return null; }
    if (team.captain_id !== req.user.userId) { res.status(403).json({ error: 'Only the admin can do this' }); return null; }
    return { teamId, userId, captainId: team.captain_id };
}

// Admin accepts a join request (invitations are accepted by the invited person)
router.post('/:id/members/:userId/accept', async (req, res) => {
    try {
        const c = await captainOf(req, res);
        if (!c) return;
        if (await countActive(req.db, c.teamId) >= LIMITS.maxMembers) return res.status(400).json({ error: 'Team is full' });
        const [r] = await req.db.execute('UPDATE team_members SET status = \'active\' WHERE team_id = ? AND user_id = ? AND status = \'pending\' AND invited_by IS NULL', [c.teamId, c.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'No pending request' });
        res.json({ message: 'Accepted' });
    } catch (e) {
        serverError(res, e);
    }
});

// Admin removes a member, declines a request or cancels an invitation
router.delete('/:id/members/:userId', async (req, res) => {
    try {
        const c = await captainOf(req, res);
        if (!c) return;
        if (c.userId === c.captainId) return res.status(400).json({ error: 'The admin cannot be removed' });
        const [r] = await req.db.execute('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [c.teamId, c.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Member not found' });
        res.json({ message: 'Removed' });
    } catch (e) {
        serverError(res, e);
    }
});

// Admin restricts a member from writing for a while (after inappropriate messages)
router.post('/:id/members/:userId/mute', async (req, res) => {
    try {
        const c = await captainOf(req, res);
        if (!c) return;
        const minutes = Number(req.body.minutes);
        if (!MUTE_MINUTES.includes(minutes)) return res.status(400).json({ error: 'minutes must be one of: ' + MUTE_MINUTES.join(', ') });
        if (c.userId === c.captainId) return res.status(400).json({ error: 'The admin cannot be restricted' });
        const [r] = await req.db.execute(
            "UPDATE team_members SET muted_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE team_id = ? AND user_id = ? AND status = 'active'",
            [minutes, c.teamId, c.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Member not found' });
        res.json({ message: 'Restricted', minutes });
    } catch (e) {
        serverError(res, e);
    }
});

// Admin lifts the restriction early
router.delete('/:id/members/:userId/mute', async (req, res) => {
    try {
        const c = await captainOf(req, res);
        if (!c) return;
        const [r] = await req.db.execute('UPDATE team_members SET muted_until = NULL WHERE team_id = ? AND user_id = ?', [c.teamId, c.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Member not found' });
        res.json({ message: 'Restriction lifted' });
    } catch (e) {
        serverError(res, e);
    }
});

// Invite a registered person by email. Who may invite depends on the team setting: only the admin, or every member.
const inviteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 40,
    keyGenerator: (req) => String(req.user.userId),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many invitations, please try again later' }
});
router.post('/:id/invite', inviteLimiter, async (req, res) => {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email' });
    try {
        const team = await getTeam(req.db, teamId);
        if (!team) return res.status(404).json({ error: 'Team not found' });
        const me = await getMember(req.db, teamId, req.user.userId);
        const isAdmin = team.captain_id === req.user.userId;
        const memberMayInvite = me && me.status === 'active' && team.invite_mode === 'members';
        if (!isAdmin && !memberMayInvite) return res.status(403).json({ error: 'You cannot invite people to this team' });
        const [users] = await req.db.execute('SELECT id, full_name FROM users WHERE LOWER(email) = ? AND blocked = 0', [email]);
        if (!users.length) return res.status(404).json({ error: 'User not found' });
        const existing = await getMember(req.db, teamId, users[0].id);
        if (existing) return res.status(409).json({ error: existing.status === 'active' ? 'Already a member' : 'Already requested or invited' });
        if (await countActive(req.db, teamId) >= LIMITS.maxMembers) return res.status(400).json({ error: 'Team is full' });
        await req.db.execute('INSERT INTO team_members (team_id, user_id, status, invited_by) VALUES (?, ?, \'pending\', ?)', [teamId, users[0].id, req.user.userId]);
        res.status(201).json({ message: 'Invitation sent', name: users[0].full_name });
    } catch (e) {
        serverError(res, e);
    }
});

// The invited person accepts or declines
router.post('/:id/invitation/accept', async (req, res) => {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const me = await getMember(req.db, teamId, req.user.userId);
        if (!me || me.status !== 'pending' || !me.invited) return res.status(404).json({ error: 'No invitation' });
        if (await countActive(req.db, teamId) >= LIMITS.maxMembers) return res.status(400).json({ error: 'Team is full' });
        await req.db.execute('UPDATE team_members SET status = \'active\' WHERE team_id = ? AND user_id = ? AND status = \'pending\' AND invited_by IS NOT NULL', [teamId, req.user.userId]);
        res.json({ message: 'Joined' });
    } catch (e) {
        serverError(res, e);
    }
});

router.post('/:id/invitation/decline', async (req, res) => {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const [r] = await req.db.execute('DELETE FROM team_members WHERE team_id = ? AND user_id = ? AND status = \'pending\' AND invited_by IS NOT NULL', [teamId, req.user.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'No invitation' });
        res.json({ message: 'Declined' });
    } catch (e) {
        serverError(res, e);
    }
});

module.exports = router;
module.exports.rating = rating;
module.exports.DIRECTIONS = DIRECTIONS;
