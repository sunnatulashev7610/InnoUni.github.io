// Team battles: the admin of a team challenges other teams; each invited team's admin accepts or declines;
// the host starts it when all have answered. Mounted at /api/battles (feature "teams").
const express = require('express');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');
const { BATTLE_LIMITS, BATTLE_KINDS } = require('../utils/battleLimits');
const { getTeam, countActive } = require('../utils/teamAccess');
const { notify } = require('../utils/notify');
const ai = require('../utils/aiProvider');

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
    const [results] = await db.execute(
        `SELECT battle_id, team_id, score, correct_total, participants, place FROM battle_results WHERE battle_id IN (${holes(ids)})`, ids);
    const [playing] = await db.execute(
        `SELECT bt.battle_id, bt.team_id FROM battle_teams bt JOIN team_members m ON m.team_id = bt.team_id WHERE m.user_id = ? AND m.status = 'active' AND bt.state IN ('host', 'accepted') AND bt.battle_id IN (${holes(ids)})`, [userId, ...ids]);
    return battles.sort((a, b) => b.id - a.id).map((b) => {
        const list = teams.filter((t) => t.battle_id === b.id);
        const mineAdmin = list.filter((t) => t.captain_id === userId);
        const myPlay = playing.find((x) => x.battle_id === b.id);
        const res = (id) => { const r = results.find((x) => x.battle_id === b.id && x.team_id === id); return r ? { score: Number(r.score), correct_total: r.correct_total, participants: r.participants, place: r.place } : null; };
        return {
            id: b.id, title: b.title, topic: b.topic, kind: b.kind, status: b.status, duration_days: b.duration_days,
            starts_at: b.starts_at, ends_at: b.ends_at, host_team_id: b.host_team_id,
            my_team_id: myPlay ? myPlay.team_id : null,
            teams: list.map((t) => ({ team_id: t.team_id, name: t.name, state: t.state, result: res(t.team_id) })),
            is_host_admin: mineAdmin.some((t) => t.team_id === b.host_team_id),
            can_respond: b.status === 'invited' && mineAdmin.some((t) => t.state === 'invited')
        };
    });
}

// Active members of the teams that play (except one person, e.g. the one who just pressed the button)
async function playingMembers(db, battleId, exceptUserId) {
    const [rows] = await db.execute(
        "SELECT DISTINCT m.user_id FROM battle_teams bt JOIN team_members m ON m.team_id = bt.team_id WHERE bt.battle_id = ? AND bt.state IN ('host', 'accepted') AND m.status = 'active' AND m.user_id <> ?", [battleId, exceptUserId]);
    return rows;
}

// A quiz battle whose time is up is closed the next time someone looks (no timer needed): the score of a team is the
// average of correct answers per member, counted over at least 3 members, so a team cannot win with one star player.
async function finalize(db, id) {
    const [bt] = await db.execute("SELECT team_id, state FROM battle_teams WHERE battle_id = ? AND state IN ('host', 'accepted')", [id]);
    const [rows] = await db.execute('SELECT user_id, team_id, SUM(correct) AS ok, COUNT(*) AS n FROM battle_answers WHERE battle_id = ? GROUP BY user_id, team_id', [id]);
    const table = bt.map((t) => {
        const mine = rows.filter((r) => r.team_id === t.team_id);
        const total = mine.reduce((a, r) => a + Number(r.ok), 0);
        const people = mine.length;
        return { team_id: t.team_id, total, people, score: Math.round((total / Math.max(people, BATTLE_LIMITS.minActiveMembers)) * 100) / 100 };
    }).sort((a, b) => b.score - a.score || b.total - a.total);
    table.forEach((r) => { r.place = table.findIndex((x) => x.score === r.score && x.total === r.total) + 1; });   // equal results share a place
    const [done] = await db.execute("UPDATE battles SET status = 'finished' WHERE id = ? AND status = 'active'", [id]);
    if (!done.affectedRows) return;   // another request closed it first
    for (const r of table) {
        await db.execute('INSERT INTO battle_results (battle_id, team_id, score, correct_total, participants, place) VALUES (?, ?, ?, ?, ?, ?)', [id, r.team_id, r.score, r.total, r.people, r.place]);
    }
    const [b] = await db.execute('SELECT id, status, host_team_id, title, duration_days, kind, topic FROM battles WHERE id = ?', [id]);
    const people = await playingMembers(db, id, 0);
    await Promise.all(people.map((p) => notify(db, p.user_id, { kind: 'battle', title: 'Battle tugadi: natija tayyor', body: b[0] ? b[0].title : '', page: 'jamoalar', refId: id })));
}

async function finalizeDue(db, ids) {
    if (!ids.length) return;
    const [due] = await db.execute(`SELECT id FROM battles WHERE id IN (${holes(ids)}) AND status = 'active' AND kind = 'quiz' AND ends_at <= UTC_TIMESTAMP()`, ids);
    for (const d of due) await finalize(db, d.id);
}

router.get('/', async (req, res) => {
    try {
        const ids = (await myBattleIds(req.db, req.user.userId)).slice(0, 50);
        await finalizeDue(req.db, ids);
        res.json({ battles: await loadBattles(req.db, ids, req.user.userId), limits: BATTLE_LIMITS, kinds: BATTLE_KINDS });
    } catch (e) { serverError(res, e); }
});

router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid battle id' });
    try {
        const ids = await myBattleIds(req.db, req.user.userId);
        if (!ids.includes(id)) return res.status(404).json({ error: 'Battle not found' });
        await finalizeDue(req.db, [id]);
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
    const [rows] = await db.execute('SELECT id, status, host_team_id, title, duration_days, kind, topic FROM battles WHERE id = ?', [id]);
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
        if (battle.kind === 'quiz') {
            // Questions are made once, before the clock starts, by the AI from the topic: no team knows them in advance
            if (!ai.isLive()) return res.status(503).json({ error: 'The AI that prepares quiz questions is not connected yet' });
            let made;
            try { made = await ai.battleQuiz({ topic: battle.topic, title: battle.title }); } catch (e) {
                console.error('Battle quiz failed:', e.message);
                return res.status(502).json({ error: 'Could not prepare the questions. Try again in a minute' });
            }
            for (let i = 0; i < made.questions.length; i++) {
                const q = made.questions[i];
                await req.db.execute('INSERT INTO battle_questions (battle_id, position, question, options, correct, explanation) VALUES (?, ?, ?, ?, ?, ?)', [battle.id, i + 1, q.q, JSON.stringify(q.options), q.answer, q.explanation || null]);
            }
        }
        await req.db.execute("UPDATE battles SET status = 'active', starts_at = UTC_TIMESTAMP(), ends_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY) WHERE id = ? AND status = 'invited'", [battle.duration_days, battle.id]);
        const people = await playingMembers(req.db, battle.id, req.user.userId);
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

// ---- Playing a quiz battle ----
// The person's playing team in this battle (active member of a team that is in, not one that declined), or null
async function myPlayingTeam(db, battleId, userId) {
    const [rows] = await db.execute(
        "SELECT bt.team_id FROM battle_teams bt JOIN team_members m ON m.team_id = bt.team_id WHERE bt.battle_id = ? AND m.user_id = ? AND m.status = 'active' AND bt.state IN ('host', 'accepted')", [battleId, userId]);
    return rows.length ? rows[0].team_id : null;
}

router.get('/:id/quiz', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid battle id' });
    try {
        const battle = await loadOne(req.db, id);
        if (!battle || battle.kind !== 'quiz') return res.status(404).json({ error: 'Battle not found' });
        const team = await myPlayingTeam(req.db, id, req.user.userId);
        if (!team) return res.status(404).json({ error: 'Battle not found' });
        await finalizeDue(req.db, [id]);
        const status = (await loadOne(req.db, id)).status;
        if (status !== 'active' && status !== 'finished') return res.status(409).json({ error: 'The quiz has not started' });
        const [qs] = await req.db.execute('SELECT id, position, question, options, correct, explanation FROM battle_questions WHERE battle_id = ? ORDER BY position', [id]);
        const [mine] = await req.db.execute('SELECT question_id, choice, correct FROM battle_answers WHERE battle_id = ? AND user_id = ?', [id, req.user.userId]);
        const over = status === 'finished';
        res.json({
            status, team_id: team, total: qs.length, answered: mine.length,
            questions: qs.map((q) => {
                const a = mine.find((x) => x.question_id === q.id);
                const out = { id: q.id, position: q.position, question: q.question, options: JSON.parse(q.options), my_choice: a ? a.choice : null };
                if (over) { out.correct = q.correct; out.explanation = q.explanation; }   // the right answers stay hidden until the end
                return out;
            })
        });
    } catch (e) { serverError(res, e); }
});

// One answer per question, never changed; whether it was right is not told until the battle ends
router.post('/:id/answer', async (req, res) => {
    const id = parseId(req.params.id);
    const qid = parseId((req.body || {}).question_id);
    const choice = (req.body || {}).choice;
    if (!id || !qid) return res.status(400).json({ error: 'Invalid battle or question id' });
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return res.status(400).json({ error: 'Choose one of the options' });
    try {
        const battle = await loadOne(req.db, id);
        if (!battle || battle.kind !== 'quiz') return res.status(404).json({ error: 'Battle not found' });
        const team = await myPlayingTeam(req.db, id, req.user.userId);
        if (!team) return res.status(403).json({ error: 'Only members of the playing teams can answer' });
        await finalizeDue(req.db, [id]);
        const now = await loadOne(req.db, id);
        if (now.status !== 'active') return res.status(409).json({ error: 'The time for this battle is over' });
        const [q] = await req.db.execute('SELECT id, correct FROM battle_questions WHERE id = ? AND battle_id = ?', [qid, id]);
        if (!q.length) return res.status(404).json({ error: 'Question not found' });
        try {
            await req.db.execute('INSERT INTO battle_answers (question_id, user_id, battle_id, team_id, choice, correct) VALUES (?, ?, ?, ?, ?, ?)', [qid, req.user.userId, id, team, choice, choice === q[0].correct ? 1 : 0]);
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Already answered this question' });
            throw e;
        }
        const [n] = await req.db.execute('SELECT COUNT(*) AS n FROM battle_answers WHERE battle_id = ? AND user_id = ?', [id, req.user.userId]);
        res.json({ saved: true, answered: Number(n[0].n) });
    } catch (e) { serverError(res, e); }
});

module.exports = router;
