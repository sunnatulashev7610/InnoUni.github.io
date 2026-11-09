const express = require('express');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');

const router = express.Router();
router.use(authenticateToken);

// Rating: topics x2 + achievements x10
const rating = (t) => t.topics_done * 2 + t.achievements * 10;

// List teams with rating and member count
router.get('/', async (req, res) => {
    try {
        const [rows] = await req.db.execute(
            'SELECT t.id, t.name, t.description, t.captain_id, t.topics_done, t.achievements, (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id AND m.status = \'active\') AS members FROM teams t ORDER BY t.id');
        const teams = rows.map((t) => ({ ...t, rating: rating(t) })).sort((a, b) => b.rating - a.rating);
        res.json({ teams });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a team: the creator becomes captain and first member
router.post('/', async (req, res) => {
    const name = validateText(req.body.name, { field: 'Name', maxLength: 100 });
    if (name.error) return res.status(400).json({ error: name.error });
    const description = validateText(req.body.description, { field: 'Description', required: false, maxLength: 1000 });
    if (description.error) return res.status(400).json({ error: description.error });
    try {
        const [result] = await req.db.execute('INSERT INTO teams (name, description, captain_id) VALUES (?, ?, ?)', [name.value, description.value, req.user.userId]);
        await req.db.execute('INSERT INTO team_members (team_id, user_id, status) VALUES (?, ?, \'active\')', [result.insertId, req.user.userId]);
        res.status(201).json({ id: result.insertId });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Team name already taken' });
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Ask to join (optionally anonymous)
router.post('/:id/join', async (req, res) => {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const [teams] = await req.db.execute('SELECT id, captain_id FROM teams WHERE id = ?', [teamId]);
        if (!teams.length) return res.status(404).json({ error: 'Team not found' });
        const [existing] = await req.db.execute('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, req.user.userId]);
        if (existing.length) return res.status(409).json({ error: 'Already requested or a member' });
        await req.db.execute('INSERT INTO team_members (team_id, user_id, status, anonymous) VALUES (?, ?, \'pending\', ?)', [teamId, req.user.userId, req.body.anonymous ? 1 : 0]);
        res.status(201).json({ message: 'Request sent' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Captain only: see members (anonymous ones are hidden from everyone but the captain's own view of requests)
router.get('/:id/members', async (req, res) => {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const [teams] = await req.db.execute('SELECT id, captain_id FROM teams WHERE id = ?', [teamId]);
        if (!teams.length) return res.status(404).json({ error: 'Team not found' });
        const isCaptain = teams[0].captain_id === req.user.userId;
        const [rows] = await req.db.execute(
            'SELECT m.user_id, m.status, m.anonymous, u.full_name FROM team_members m JOIN users u ON m.user_id = u.id WHERE m.team_id = ? ORDER BY m.id', [teamId]);
        const members = rows
            .filter((m) => isCaptain || m.status === 'active')
            .map((m) => ({
                user_id: m.anonymous && !isCaptain ? null : m.user_id,
                name: m.anonymous && !isCaptain ? 'Anonim' : m.full_name,
                status: m.status
            }));
        res.json({ members, isCaptain });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

async function captainOf(req, res) {
    const teamId = parseId(req.params.id);
    const userId = parseId(req.params.userId);
    if (!teamId || !userId) { res.status(400).json({ error: 'Invalid id' }); return null; }
    const [teams] = await req.db.execute('SELECT id, captain_id FROM teams WHERE id = ?', [teamId]);
    if (!teams.length) { res.status(404).json({ error: 'Team not found' }); return null; }
    if (teams[0].captain_id !== req.user.userId) { res.status(403).json({ error: 'Only the captain can do this' }); return null; }
    return { teamId, userId, captainId: teams[0].captain_id };
}

// Captain accepts a request
router.post('/:id/members/:userId/accept', async (req, res) => {
    try {
        const c = await captainOf(req, res);
        if (!c) return;
        const [r] = await req.db.execute('UPDATE team_members SET status = \'active\' WHERE team_id = ? AND user_id = ? AND status = \'pending\'', [c.teamId, c.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'No pending request' });
        res.json({ message: 'Accepted' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Captain removes a member or declines a request
router.delete('/:id/members/:userId', async (req, res) => {
    try {
        const c = await captainOf(req, res);
        if (!c) return;
        if (c.userId === c.captainId) return res.status(400).json({ error: 'Captain cannot be removed' });
        const [r] = await req.db.execute('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [c.teamId, c.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Member not found' });
        res.json({ message: 'Removed' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
module.exports.rating = rating;
