// Team resource library. Mounted at /api/teams/:id/resources (see teams.js, which already requires a login).
// Active members share links (title + note) and vote for the useful ones. Best-voted first.
const express = require('express');
const { parseId, validateText } = require('../utils/validation');
const { RESOURCE_LIMITS } = require('../utils/teamLimits');
const { getTeam, getMember } = require('../utils/teamAccess');

const router = express.Router({ mergeParams: true });

async function memberOnly(req, res, next) {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const team = await getTeam(req.db, teamId);
        if (!team) return res.status(404).json({ error: 'Team not found' });
        const member = await getMember(req.db, teamId, req.user.userId);
        if (!member || member.status !== 'active') return res.status(403).json({ error: 'Only team members can use resources' });
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

// Only plain web links, no logins inside the address
function cleanUrl(value) {
    if (typeof value !== 'string') return { error: 'Link is required' };
    const text = value.trim();
    if (!text) return { error: 'Link is required' };
    if (text.length > RESOURCE_LIMITS.maxUrlLength) return { error: `Link must be at most ${RESOURCE_LIMITS.maxUrlLength} characters` };
    let u;
    try { u = new URL(text); } catch (e) { return { error: 'Link is not valid' }; }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return { error: 'Link must start with http:// or https://' };
    return { value: u.toString() };
}

router.get('/', async (req, res) => {
    try {
        const teamId = req.team.id;
        const [rows] = await req.db.execute(
            'SELECT r.id, r.user_id, r.title, r.url, r.note, r.created_at, u.full_name, tm.anonymous ' +
            'FROM team_resources r JOIN users u ON u.id = r.user_id ' +
            'LEFT JOIN team_members tm ON tm.team_id = r.team_id AND tm.user_id = r.user_id ' +
            'WHERE r.team_id = ? ORDER BY r.id DESC LIMIT 200', [teamId]);
        const [votes] = await req.db.execute('SELECT resource_id, user_id FROM team_resource_votes WHERE team_id = ?', [teamId]);
        const count = {}; const mine = new Set();
        votes.forEach((v) => { count[v.resource_id] = (count[v.resource_id] || 0) + 1; if (v.user_id === req.user.userId) mine.add(v.resource_id); });
        const resources = rows.map((r) => {
            const hidden = Boolean(Number(r.anonymous)) && !req.isAdmin;
            return {
                id: r.id, title: r.title, url: r.url, note: r.note, created_at: r.created_at,
                added_by: hidden ? 'Anonim' : r.full_name,
                mine: r.user_id === req.user.userId,
                votes: count[r.id] || 0,
                voted: mine.has(r.id)
            };
        }).sort((a, b) => b.votes - a.votes || b.id - a.id);
        res.json({ resources, limits: RESOURCE_LIMITS, me: { is_admin: req.isAdmin } });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    const title = validateText(req.body.title, { field: 'Title', maxLength: RESOURCE_LIMITS.maxTitleLength });
    if (title.error) return res.status(400).json({ error: title.error });
    const note = validateText(req.body.note, { field: 'Note', required: false, maxLength: RESOURCE_LIMITS.maxNoteLength });
    if (note.error) return res.status(400).json({ error: note.error });
    const url = cleanUrl(req.body.url);
    if (url.error) return res.status(400).json({ error: url.error });
    try {
        if (req.member.muted && !req.isAdmin) return res.status(403).json({ error: 'You are restricted from writing for now', muted_seconds: req.member.muted_seconds });
        const [recent] = await req.db.execute('SELECT COUNT(*) AS n FROM team_resources WHERE team_id = ? AND user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)', [req.team.id, req.user.userId]);
        if (Number(recent[0].n) >= RESOURCE_LIMITS.perPersonPerDay) return res.status(429).json({ error: 'Too many resources today. Try again tomorrow' });
        const [r] = await req.db.execute('INSERT INTO team_resources (team_id, user_id, title, url, note) VALUES (?, ?, ?, ?, ?)', [req.team.id, req.user.userId, title.value, url.value, note.value]);
        res.status(201).json({ id: r.insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Vote on / take back the vote. Not on your own link.
router.post('/:rid/vote', async (req, res) => {
    const rid = parseId(req.params.rid);
    if (!rid) return res.status(400).json({ error: 'Invalid resource id' });
    try {
        const [found] = await req.db.execute('SELECT id, user_id FROM team_resources WHERE id = ? AND team_id = ?', [rid, req.team.id]);
        if (!found.length) return res.status(404).json({ error: 'Resource not found' });
        if (found[0].user_id === req.user.userId) return res.status(400).json({ error: 'You cannot vote for your own resource' });
        const [had] = await req.db.execute('SELECT resource_id FROM team_resource_votes WHERE resource_id = ? AND user_id = ?', [rid, req.user.userId]);
        if (had.length) await req.db.execute('DELETE FROM team_resource_votes WHERE resource_id = ? AND user_id = ?', [rid, req.user.userId]);
        else await req.db.execute('INSERT INTO team_resource_votes (resource_id, user_id, team_id) VALUES (?, ?, ?)', [rid, req.user.userId, req.team.id]);
        res.json({ voted: !had.length });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// The person who added it, or the admin
router.delete('/:rid', async (req, res) => {
    const rid = parseId(req.params.rid);
    if (!rid) return res.status(400).json({ error: 'Invalid resource id' });
    try {
        const [found] = await req.db.execute('SELECT id, user_id FROM team_resources WHERE id = ? AND team_id = ?', [rid, req.team.id]);
        if (!found.length) return res.status(404).json({ error: 'Resource not found' });
        if (found[0].user_id !== req.user.userId && !req.isAdmin) return res.status(403).json({ error: 'Only the author or the admin can delete this' });
        await req.db.execute('DELETE FROM team_resource_votes WHERE resource_id = ?', [rid]);
        await req.db.execute('DELETE FROM team_resources WHERE id = ? AND team_id = ?', [rid, req.team.id]);
        res.json({ message: 'Deleted' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
