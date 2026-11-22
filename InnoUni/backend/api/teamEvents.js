// Team meetups. Mounted at /api/teams/:id/events (see teams.js, which already requires a login).
// The admin plans a meetup; active members say whether they are going. Times travel as UTC.
const express = require('express');
const { parseId, validateText } = require('../utils/validation');
const { EVENT_LIMITS } = require('../utils/teamLimits');
const { getTeam, getMember } = require('../utils/teamAccess');
const { notify } = require('../utils/notify');

const router = express.Router({ mergeParams: true });

async function memberOnly(req, res, next) {
    const teamId = parseId(req.params.id);
    if (!teamId) return res.status(400).json({ error: 'Invalid team id' });
    try {
        const team = await getTeam(req.db, teamId);
        if (!team) return res.status(404).json({ error: 'Team not found' });
        const member = await getMember(req.db, teamId, req.user.userId);
        if (!member || member.status !== 'active') return res.status(403).json({ error: 'Only team members can use meetups' });
        req.team = team;
        req.isAdmin = team.captain_id === req.user.userId;
        next();
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
}
router.use(memberOnly);

// A date the server can trust: a real moment, in the future, not too far ahead
function cleanStart(value) {
    if (typeof value !== 'string') return { error: 'Date and time are required' };
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { error: 'Date and time are not valid' };
    const now = Date.now();
    if (d.getTime() <= now) return { error: 'The meetup must be in the future' };
    if (d.getTime() > now + EVENT_LIMITS.maxDaysAhead * 86400000) return { error: 'The meetup is too far ahead' };
    return { value: d.toISOString().slice(0, 19).replace('T', ' ') };
}

// Meetups from yesterday on, soonest first
router.get('/', async (req, res) => {
    try {
        const teamId = req.team.id;
        const [rows] = await req.db.execute(
            "SELECT id, title, place, note, DATE_FORMAT(starts_at, '%Y-%m-%dT%H:%i:%sZ') AS starts_at FROM team_events " +
            'WHERE team_id = ? AND starts_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) ORDER BY starts_at ASC LIMIT 100', [teamId]);
        const [going] = await req.db.execute('SELECT event_id, user_id FROM team_event_going WHERE team_id = ?', [teamId]);
        const count = {}; const mine = new Set();
        going.forEach((g) => { count[g.event_id] = (count[g.event_id] || 0) + 1; if (g.user_id === req.user.userId) mine.add(g.event_id); });
        res.json({
            events: rows.map((e) => ({ id: e.id, title: e.title, place: e.place, note: e.note, starts_at: e.starts_at, going: count[e.id] || 0, i_go: mine.has(e.id) })),
            limits: EVENT_LIMITS,
            me: { is_admin: req.isAdmin }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin only: plan a meetup, every member is told
router.post('/', async (req, res) => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Only the admin can plan meetups' });
    const title = validateText(req.body.title, { field: 'Title', maxLength: EVENT_LIMITS.maxTitleLength });
    if (title.error) return res.status(400).json({ error: title.error });
    const place = validateText(req.body.place, { field: 'Place', required: false, maxLength: EVENT_LIMITS.maxPlaceLength });
    if (place.error) return res.status(400).json({ error: place.error });
    const note = validateText(req.body.note, { field: 'Note', required: false, maxLength: EVENT_LIMITS.maxNoteLength });
    if (note.error) return res.status(400).json({ error: note.error });
    const start = cleanStart(req.body.starts_at);
    if (start.error) return res.status(400).json({ error: start.error });
    try {
        const [open] = await req.db.execute('SELECT COUNT(*) AS n FROM team_events WHERE team_id = ? AND starts_at >= UTC_TIMESTAMP()', [req.team.id]);
        if (Number(open[0].n) >= EVENT_LIMITS.maxUpcoming) return res.status(400).json({ error: `At most ${EVENT_LIMITS.maxUpcoming} upcoming meetups` });
        const [r] = await req.db.execute('INSERT INTO team_events (team_id, user_id, title, place, note, starts_at) VALUES (?, ?, ?, ?, ?, ?)', [req.team.id, req.user.userId, title.value, place.value, note.value, start.value]);
        const [people] = await req.db.execute("SELECT user_id FROM team_members WHERE team_id = ? AND status = 'active' AND user_id <> ?", [req.team.id, req.user.userId]);
        await Promise.all(people.map((p) => notify(req.db, p.user_id, { kind: 'team', title: 'Yangi uchrashuv', body: `${req.team.name}: ${title.value}`, page: 'jamoalar', refId: req.team.id })));
        res.status(201).json({ id: r.insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// "I'm going" / "I'm not going"
router.post('/:eid/going', async (req, res) => {
    const eid = parseId(req.params.eid);
    if (!eid) return res.status(400).json({ error: 'Invalid meetup id' });
    try {
        const [found] = await req.db.execute('SELECT id FROM team_events WHERE id = ? AND team_id = ?', [eid, req.team.id]);
        if (!found.length) return res.status(404).json({ error: 'Meetup not found' });
        const [had] = await req.db.execute('SELECT event_id FROM team_event_going WHERE event_id = ? AND user_id = ?', [eid, req.user.userId]);
        if (had.length) await req.db.execute('DELETE FROM team_event_going WHERE event_id = ? AND user_id = ?', [eid, req.user.userId]);
        else await req.db.execute('INSERT INTO team_event_going (event_id, user_id, team_id) VALUES (?, ?, ?)', [eid, req.user.userId, req.team.id]);
        res.json({ i_go: !had.length });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/:eid', async (req, res) => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Only the admin can delete meetups' });
    const eid = parseId(req.params.eid);
    if (!eid) return res.status(400).json({ error: 'Invalid meetup id' });
    try {
        const [found] = await req.db.execute('SELECT id FROM team_events WHERE id = ? AND team_id = ?', [eid, req.team.id]);
        if (!found.length) return res.status(404).json({ error: 'Meetup not found' });
        await req.db.execute('DELETE FROM team_event_going WHERE event_id = ?', [eid]);
        await req.db.execute('DELETE FROM team_events WHERE id = ? AND team_id = ?', [eid, req.team.id]);
        res.json({ message: 'Deleted' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
