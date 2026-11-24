// Seasonal tournaments, the teams' side: look at tournaments, register a team, leave before the draw.
// The platform admin creates, draws and runs them (api/admin.js). Mounted at /api/tournaments (feature "teams").
const express = require('express');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId } = require('../utils/validation');
const { BATTLE_LIMITS } = require('../utils/battleLimits');
const { TOURNAMENT_LIMITS } = require('../utils/tournamentDraw');
const { getTeam, countActive } = require('../utils/teamAccess');

const router = express.Router();
router.use(authenticateToken);

const serverError = (res, e) => { console.error(e); res.status(500).json({ error: 'Server error' }); };
const holes = (list) => list.map(() => '?').join(', ');

// Everything the page needs, in a few queries. userId 0 = nobody in particular (admin view)
async function loadTournaments(db, userId, onlyId) {
    const [list] = onlyId
        ? await db.execute('SELECT id, title, topic, round_days, status FROM tournaments WHERE id = ?', [onlyId])
        : await db.execute("SELECT id, title, topic, round_days, status FROM tournaments WHERE status <> 'cancelled' ORDER BY id DESC LIMIT 10", []);
    if (!list.length) return [];
    const ids = list.map((t) => t.id);
    const [teams] = await db.execute(`SELECT tt.tournament_id, tt.team_id, tt.group_no, tt.seed_rating, t.name, t.captain_id FROM tournament_teams tt JOIN teams t ON t.id = tt.team_id WHERE tt.tournament_id IN (${holes(ids)}) ORDER BY tt.group_no, tt.created_at`, ids);
    const [matches] = await db.execute(`SELECT id, tournament_id, stage, group_no, round_no, team_a, team_b, battle_id FROM tournament_matches WHERE tournament_id IN (${holes(ids)}) ORDER BY round_no, group_no, id`, ids);
    return list.map((t) => {
        const mine = teams.filter((x) => x.tournament_id === t.id);
        const name = (id) => (mine.find((x) => x.team_id === id) || {}).name;
        return {
            id: t.id, title: t.title, topic: t.topic, round_days: t.round_days, status: t.status,
            teams: mine.map((x) => ({ team_id: x.team_id, name: x.name, group_no: x.group_no, seed_rating: x.seed_rating, mine: x.captain_id === userId })),
            matches: matches.filter((m) => m.tournament_id === t.id).map((m) => ({ id: m.id, stage: m.stage, group_no: m.group_no, round_no: m.round_no, team_a: m.team_a, team_b: m.team_b, name_a: name(m.team_a), name_b: name(m.team_b), battle_id: m.battle_id }))
        };
    });
}

router.get('/', async (req, res) => {
    try {
        const list = await loadTournaments(req.db, req.user.userId);
        const [mine] = await req.db.execute('SELECT id, name FROM teams WHERE captain_id = ?', [req.user.userId]);
        const out = [];
        for (const m of mine) out.push({ id: m.id, name: m.name, members: await countActive(req.db, m.id) });
        res.json({ tournaments: list, my_admin_teams: out, limits: { min_members: BATTLE_LIMITS.minActiveMembers, max_teams: TOURNAMENT_LIMITS.maxTeams } });
    } catch (e) { serverError(res, e); }
});

async function ownTeam(req, res) {
    const teamId = parseId(req.body && req.body.team_id);
    if (!teamId) { res.status(400).json({ error: 'Choose a team' }); return null; }
    const team = await getTeam(req.db, teamId);
    if (!team) { res.status(404).json({ error: 'Team not found' }); return null; }
    if (team.captain_id !== req.user.userId) { res.status(403).json({ error: 'Only the team admin can do this' }); return null; }
    return team;
}

async function openTournament(req, res) {
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid tournament id' }); return null; }
    const [rows] = await req.db.execute('SELECT id, title, topic, round_days, status FROM tournaments WHERE id = ?', [id]);
    if (!rows[0] || rows[0].status === 'cancelled') { res.status(404).json({ error: 'Tournament not found' }); return null; }
    if (rows[0].status !== 'open') { res.status(409).json({ error: 'Registration is closed' }); return null; }
    return rows[0];
}

router.post('/:id/register', async (req, res) => {
    try {
        const t = await openTournament(req, res); if (!t) return;
        const team = await ownTeam(req, res); if (!team) return;
        const [already] = await req.db.execute('SELECT team_id FROM tournament_teams WHERE tournament_id = ? AND team_id = ?', [t.id, team.id]);
        if (already.length) return res.status(409).json({ error: 'Team is already registered' });
        const [all] = await req.db.execute('SELECT team_id FROM tournament_teams WHERE tournament_id = ?', [t.id]);
        if (all.length >= TOURNAMENT_LIMITS.maxTeams) return res.status(409).json({ error: 'The tournament is full' });
        if ((await countActive(req.db, team.id)) < BATTLE_LIMITS.minActiveMembers) return res.status(400).json({ error: `A team needs at least ${BATTLE_LIMITS.minActiveMembers} active members` });
        await req.db.execute('INSERT INTO tournament_teams (tournament_id, team_id, registered_by) VALUES (?, ?, ?)', [t.id, team.id, req.user.userId]);
        res.status(201).json({ registered: true });
    } catch (e) { serverError(res, e); }
});

router.post('/:id/withdraw', async (req, res) => {
    try {
        const t = await openTournament(req, res); if (!t) return;
        const team = await ownTeam(req, res); if (!team) return;
        const [r] = await req.db.execute('DELETE FROM tournament_teams WHERE tournament_id = ? AND team_id = ?', [t.id, team.id]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Team is not registered' });
        res.json({ withdrawn: true });
    } catch (e) { serverError(res, e); }
});

module.exports = router;
module.exports.loadTournaments = loadTournaments;
