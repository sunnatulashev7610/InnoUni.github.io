// Team battles: the admin of a team challenges other teams; each invited team's admin accepts or declines;
// the host starts it when all have answered. Mounted at /api/battles (feature "teams").
const express = require('express');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');
const { BATTLE_LIMITS, BATTLE_KINDS } = require('../utils/battleLimits');
const { getTeam, countActive } = require('../utils/teamAccess');
const { notify } = require('../utils/notify');

const router = express.Router();
router.use(authenticateToken);

const serverError = (res, e) => { console.error(e); res.status(500).json({ error: 'Server error' }); };
const holes = (list) => list.map(() => '?').join(', ');
const ISO = (col) => `DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%sZ')`;

// Battles the person can see: those where one of their teams (active member) takes part
async function myBattleIds(db, userId) {
    const [rows] = await db.execute(
        "SELECT DISTINCT bt.battle_id FROM battle_teams bt JOIN team_members m ON m.team_id = bt.team_id WHERE m.user_id = ? AND m.status = 'active'", [userId]);
    return rows.map((r) => r.battle_id).sort((a, b) => b - a);
}

async function loadBattles(db, ids, userId) {
    if (!ids.length) return [];
    const [battles] = await db.execute(
        `SELECT id, title, topic, kind, status, duration_days, host_team_id, ${ISO('starts_at')} AS starts_at, ${ISO('ends_at')} AS ends_at FROM battles WHERE id IN (${holes(ids)})`, ids);
    const [teams] = await db.execute(
        `SELECT bt.battle_id, bt.team_id, bt.state, t.name, t.captain_id FROM battle_teams bt JOIN teams t ON t.id = bt.team_id WHERE bt.battle_id IN (${holes(ids)})`, ids);
    return battles.sort((a, b) => b.id - a.id).map((b) => {
        const list = teams.filter((t) => t.battle_id === b.id);
        const mineAdmin = list.filter((t) => t.captain_id === userId);
        return {
            id: b.id, title: b.title, topic: b.topic, kind: b.kind, status: b.status, duration_days: b.duration_days,
            starts_at: b.starts_at, ends_at: b.ends_at, host_team_id: b.host_team_id,
            teams: list.map((t) => ({ team_id: t.team_id, name: t.name, state: t.state })),
            is_host_admin: mineAdmin.some((t) => t.team_id === b.host_team_id),
            can_respond: b.status === 'invited' && mineAdmin.some((t) => t.state === 'invited')
        };
    });
}

router.get('/', async (req, res) => {
    try {
        const ids = (await myBattleIds(req.db, req.user.userId)).slice(0, 50);
        res.json({ battles: await loadBattles(req.db, ids, req.user.userId), limits: BATTLE_LIMITS, kinds: BATTLE_KINDS });
    } catch (e) { serverError(res, e); }
});

router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid battle id' });
    try {
        const ids = await myBattleIds(req.db, req.user.userId);
        if (!ids.includes(id)) return res.status(404).json({ error: 'Battle not found' });
        res.json({ battle: (await loadBattles(req.db, [id], req.user.userId))[0] });
    } catch (e) { serverError(res, e); }
});

// Challenge: only the admin of the host team
router.post('/', async (req, res) => {
    const b = req.body || {};
    const hostId = parseId(b.host_team_id);
    if (!hostId) return res.status(400).json({ error: 'Choose your team' });
    const title = validateText(b.title, { field: 'Title', maxLength: BATTLE_LIMITS.maxTitleLength });
    if (title.error) return res.status(400).json({ error: title.error });
    const topic = validateText(b.topic, { field: 'Topic', maxLength: BATTLE_LIMITS.maxTopicLength });
    if (topic.error) return res.status(400).json({ error: topic.error });
    if (!BATTLE_KINDS.includes(b.kind)) return res.status(400).json({ error: 'Kind must be one of: ' + BATTLE_KINDS.join(', ') });
    const days = b.duration_days;
    if (!Number.isInteger(days) || days < 1 || days > BATTLE_LIMITS.maxDays) return res.status(400).json({ error: `Duration must be 1 to ${BATTLE_LIMITS.maxDays} days` });
    const rawOpp = Array.isArray(b.opponent_team_ids) ? b.opponent_team_ids : null;
    if (!rawOpp) return res.status(400).json({ error: 'Choose at least one opponent team' });
    const opponents = [...new Set(rawOpp.map(parseId))];
    if (!opponents.length || opponents.some((x) => !x) || opponents.length > BATTLE_LIMITS.maxOpponents) return res.status(400).json({ error: `Choose 1 to ${BATTLE_LIMITS.maxOpponents} opponent teams` });
    if (opponents.includes(hostId)) return res.status(400).json({ error: 'A team cannot challenge itself' });
    try {
        const host = await getTeam(req.db, hostId);
        if (!host) return res.status(404).json({ error: 'Team not found' });
        if (host.captain_id !== req.user.userId) return res.status(403).json({ error: 'Only the team admin can start a battle' });
        const need = BATTLE_LIMITS.minActiveMembers;
        if ((await countActive(req.db, hostId)) < need) return res.status(400).json({ error: `Your team needs at least ${need} active members` });
        const rivals = [];
        for (const oid of opponents) {
            const t = await getTeam(req.db, oid);
            if (!t) return res.status(404).json({ error: 'Opponent team not found' });
            if ((await countActive(req.db, oid)) < need) return res.status(400).json({ error: `Team "${t.name}" has fewer than ${need} active members` });
            const [pair] = await req.db.execute(
                "SELECT COUNT(*) AS n FROM battle_teams a JOIN battle_teams o ON o.battle_id = a.battle_id JOIN battles x ON x.id = a.battle_id WHERE a.team_id = ? AND o.team_id = ? AND x.status <> 'cancelled' AND x.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)", [hostId, oid]);
            if (Number(pair[0].n) >= BATTLE_LIMITS.maxPerPairPerWeek) return res.status(429).json({ error: `Teams can battle each other at most ${BATTLE_LIMITS.maxPerPairPerWeek} times a week` });
            rivals.push(t);
        }
        const [open] = await req.db.execute(
            "SELECT COUNT(*) AS n FROM battle_teams bt JOIN battles x ON x.id = bt.battle_id WHERE bt.team_id = ? AND x.status IN ('invited', 'active')", [hostId]);
        if (Number(open[0].n) >= BATTLE_LIMITS.maxOpenPerTeam) return res.status(400).json({ error: `At most ${BATTLE_LIMITS.maxOpenPerTeam} open battles per team` });
        const [made] = await req.db.execute(
            'INSERT INTO battles (title, topic, kind, duration_days, host_team_id, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [title.value, topic.value, b.kind, days, hostId, req.user.userId]);
        await req.db.execute("INSERT INTO battle_teams (battle_id, team_id, state) VALUES (?, ?, 'host')", [made.insertId, hostId]);
        for (const t of rivals) {
            await req.db.execute("INSERT INTO battle_teams (battle_id, team_id, state) VALUES (?, ?, 'invited')", [made.insertId, t.id]);
            await notify(req.db, t.captain_id, { kind: 'battle', title: 'Yangi battle chaqirig\'i', body: `${host.name}: ${title.value}`, page: 'jamoalar', refId: made.insertId });
        }
        res.status(201).json({ id: made.insertId });
    } catch (e) { serverError(res, e); }
});

async function loadOne(db, id) {
    const [rows] = await db.execute('SELECT id, status, host_team_id, title, duration_days FROM battles WHERE id = ?', [id]);
    return rows[0] || null;
}

// An invited team's admin answers: { accept: true | false }
router.post('/:id/respond', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid battle id' });
    if (typeof (req.body || {}).accept !== 'boolean') return res.status(400).json({ error: 'accept must be true or false' });
    const accept = req.body.accept;
    try {
        const battle = await loadOne(req.db, id);
        if (!battle) return res.status(404).json({ error: 'Battle not found' });
        const [mine] = await req.db.execute(
            "SELECT bt.team_id, t.name FROM battle_teams bt JOIN teams t ON t.id = bt.team_id WHERE bt.battle_id = ? AND t.captain_id = ? AND bt.state = 'invited'", [id, req.user.userId]);
        if (!mine.length) return res.status(403).json({ error: 'No invitation to answer for your teams' });
        if (battle.status !== 'invited') return res.status(409).json({ error: 'This battle is no longer waiting for answers' });
        const team = mine[0];
        if (accept && (await countActive(req.db, team.team_id)) < BATTLE_LIMITS.minActiveMembers) {
            return res.status(400).json({ error: `Your team needs at least ${BATTLE_LIMITS.minActiveMembers} active members` });
        }
        await req.db.execute('UPDATE battle_teams SET state = ?, responded_at = NOW() WHERE battle_id = ? AND team_id = ?', [accept ? 'accepted' : 'declined', id, team.team_id]);
        const [states] = await req.db.execute('SELECT state FROM battle_teams WHERE battle_id = ?', [id]);
        const alive = states.some((s) => s.state === 'invited' || s.state === 'accepted');
        if (!alive) await req.db.execute("UPDATE battles SET status = 'cancelled' WHERE id = ?", [id]);
        const host = await getTeam(req.db, battle.host_team_id);
        if (host) await notify(req.db, host.captain_id, { kind: 'battle', title: accept ? 'Battle chaqirig\'i qabul qilindi' : 'Battle chaqirig\'i rad etildi', body: `${team.name}: ${battle.title}`, page: 'jamoalar', refId: id });
        res.json({ state: accept ? 'accepted' : 'declined', cancelled: !alive });
    } catch (e) { serverError(res, e); }
});

async function hostOnly(req, res) {
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid battle id' }); return null; }
    const battle = await loadOne(req.db, id);
    if (!battle) { res.status(404).json({ error: 'Battle not found' }); return null; }
    const host = await getTeam(req.db, battle.host_team_id);
    if (!host || host.captain_id !== req.user.userId) { res.status(403).json({ error: 'Only the host team admin can do this' }); return null; }
    if (battle.status !== 'invited') { res.status(409).json({ error: 'This battle is no longer waiting for answers' }); return null; }
    return battle;
}

// The host starts it once every invited team has answered and at least one accepted
router.post('/:id/start', async (req, res) => {
    try {
        const battle = await hostOnly(req, res);
        if (!battle) return;
        const [teams] = await req.db.execute('SELECT team_id, state FROM battle_teams WHERE battle_id = ?', [battle.id]);
        if (teams.some((t) => t.state === 'invited')) return res.status(400).json({ error: 'Some teams have not answered yet' });
        const playing = teams.filter((t) => t.state === 'host' || t.state === 'accepted');
        if (playing.length < 2) return res.status(400).json({ error: 'At least one team must accept' });
        for (const t of playing) {
            if ((await countActive(req.db, t.team_id)) < BATTLE_LIMITS.minActiveMembers) return res.status(400).json({ error: `Every team needs at least ${BATTLE_LIMITS.minActiveMembers} active members` });
        }
        await req.db.execute("UPDATE battles SET status = 'active', starts_at = UTC_TIMESTAMP(), ends_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY) WHERE id = ? AND status = 'invited'", [battle.duration_days, battle.id]);
        const [people] = await req.db.execute(
            "SELECT DISTINCT m.user_id FROM battle_teams bt JOIN team_members m ON m.team_id = bt.team_id WHERE bt.battle_id = ? AND bt.state IN ('host', 'accepted') AND m.status = 'active' AND m.user_id <> ?", [battle.id, req.user.userId]);
        await Promise.all(people.map((p) => notify(req.db, p.user_id, { kind: 'battle', title: 'Battle boshlandi', body: battle.title, page: 'jamoalar', refId: battle.id })));
        res.json({ status: 'active' });
    } catch (e) { serverError(res, e); }
});

router.post('/:id/cancel', async (req, res) => {
    try {
        const battle = await hostOnly(req, res);
        if (!battle) return;
        await req.db.execute("UPDATE battles SET status = 'cancelled' WHERE id = ? AND status = 'invited'", [battle.id]);
        const [asked] = await req.db.execute("SELECT t.captain_id FROM battle_teams bt JOIN teams t ON t.id = bt.team_id WHERE bt.battle_id = ? AND bt.state IN ('invited', 'accepted')", [battle.id]);
        await Promise.all(asked.map((a) => notify(req.db, a.captain_id, { kind: 'battle', title: 'Battle bekor qilindi', body: battle.title, page: 'jamoalar', refId: battle.id })));
        res.json({ status: 'cancelled' });
    } catch (e) { serverError(res, e); }
});

module.exports = router;
