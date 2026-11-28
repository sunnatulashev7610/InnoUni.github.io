const express = require('express');
const { authenticateToken, adminOnly, invalidateUserCache } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');

const battles = require('./battles');
const tournaments = require('./tournaments');
const { TOURNAMENT_LIMITS, STAGES, STAGE_TITLE, groupCount, drawGroups, roundRobin, playoffPairs, firstStage, nextPairs } = require('../utils/tournamentDraw');
const { notify } = require('../utils/notify');
const { SLOTS, slotOfRound, cleanQuestions, LIMITS: QUESTION_LIMITS } = require('../utils/tournamentQuestions');
const ai = require('../utils/aiProvider');
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
        const [teams] = await req.db.execute('SELECT COUNT(*) AS n FROM teams');
        const [extra] = await req.db.execute(
            'SELECT (SELECT COUNT(*) FROM courses) AS courses, (SELECT COUNT(*) FROM battle_appeals WHERE status = \'open\') AS appeals_open, (SELECT COUNT(*) FROM users WHERE email_verified = 0) AS unverified, (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS new_week');
        const by = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], Number(r.n)]));
        const users = by(roles, 'role');
        res.json({
            users: { student: 0, teacher: 0, admin: 0, ...users },
            teams: Number(teams[0]?.n || 0),
            courses: Number(extra[0]?.courses || 0),
            unverified: Number(extra[0]?.unverified || 0),
            appeals_open: Number(extra[0]?.appeals_open || 0),
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

// ---- Objections to battle results: the admin reads them and answers ----
router.get('/appeals', async (req, res) => {
    try {
        const status = req.query.status === 'resolved' ? 'resolved' : 'open';
        const [rows] = await req.db.execute(
            `SELECT a.id, a.battle_id, a.team_id, a.reason, a.status, a.admin_note, a.created_at, b.title AS battle_title, t.name AS team_name, u.full_name AS captain_name FROM battle_appeals a JOIN battles b ON b.id = a.battle_id JOIN teams t ON t.id = a.team_id JOIN users u ON u.id = a.user_id WHERE ${status === 'open' ? "a.status = 'open'" : "a.status <> 'open'"} ORDER BY a.id DESC LIMIT 50`, []);
        res.json({ appeals: rows });
    } catch (e) { fail(res, e); }
});

router.post('/appeals/:id/resolve', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid appeal id' });
        const decision = req.body && req.body.decision;
        if (!['accepted', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Decision must be accepted or rejected' });
        const note = validateText(req.body.note, { field: 'Note', required: true, maxLength: 300 });
        if (note.error) return res.status(400).json({ error: note.error });
        const [rows] = await req.db.execute('SELECT a.id, a.status, a.user_id, a.battle_id, b.title FROM battle_appeals a JOIN battles b ON b.id = a.battle_id WHERE a.id = ?', [id]);
        if (!rows.length) return res.status(404).json({ error: 'Appeal not found' });
        const [done] = await req.db.execute("UPDATE battle_appeals SET status = ?, admin_note = ?, resolved_by = ?, resolved_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'open'", [decision, note.value, req.user.userId, id]);
        if (!done.affectedRows) return res.status(409).json({ error: 'This objection has already been answered' });
        await notify(req.db, rows[0].user_id, { kind: 'battle', title: decision === 'accepted' ? "E'tirozingiz qabul qilindi" : "E'tirozingiz rad etildi", body: `${rows[0].title}: ${note.value}`, page: 'musobaqalar', refId: rows[0].battle_id });
        res.json({ status: decision });
    } catch (e) { fail(res, e); }
});

// ---- Seasonal tournaments: create, draw the groups, cancel ----
router.get('/tournaments', async (req, res) => {
    try { res.json({ tournaments: await tournaments.loadTournaments(req.db, 0), limits: TOURNAMENT_LIMITS }); } catch (e) { fail(res, e); }
});

router.post('/tournaments', async (req, res) => {
    try {
        const b = req.body || {};
        const title = validateText(b.title, { field: 'Title', maxLength: TOURNAMENT_LIMITS.maxTitleLength });
        if (title.error) return res.status(400).json({ error: title.error });
        const topic = validateText(b.topic, { field: 'Topic', maxLength: TOURNAMENT_LIMITS.maxTopicLength });
        if (topic.error) return res.status(400).json({ error: topic.error });
        const days = b.round_days === undefined ? TOURNAMENT_LIMITS.defaultRoundDays : b.round_days;
        if (!Number.isInteger(days) || days < TOURNAMENT_LIMITS.minRoundDays || days > TOURNAMENT_LIMITS.maxRoundDays) return res.status(400).json({ error: `Round length must be ${TOURNAMENT_LIMITS.minRoundDays}-${TOURNAMENT_LIMITS.maxRoundDays} days` });
        const [made] = await req.db.execute('INSERT INTO tournaments (title, topic, round_days, created_by) VALUES (?, ?, ?, ?)', [title.value, topic.value, days, req.user.userId]);
        res.status(201).json({ id: made.insertId });
    } catch (e) { fail(res, e); }
});

async function tournamentIn(req, res, statuses) {
    const id = parseId(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid tournament id' }); return null; }
    const [rows] = await req.db.execute('SELECT id, title, topic, round_days, status FROM tournaments WHERE id = ?', [id]);
    if (!rows[0]) { res.status(404).json({ error: 'Tournament not found' }); return null; }
    if (!statuses.includes(rows[0].status)) { res.status(409).json({ error: 'This step is not possible in the current stage' }); return null; }
    return rows[0];
}

router.post('/tournaments/:id/remove-team', async (req, res) => {
    try {
        const t = await tournamentIn(req, res, ['open']); if (!t) return;
        const teamId = parseId(req.body && req.body.team_id);
        if (!teamId) return res.status(400).json({ error: 'Choose a team' });
        const [r] = await req.db.execute('DELETE FROM tournament_teams WHERE tournament_id = ? AND team_id = ?', [t.id, teamId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Team is not registered' });
        res.json({ removed: true });
    } catch (e) { fail(res, e); }
});

// Closes registration: groups by snake seeding on battle rating, then the whole group-stage fixture list
router.post('/tournaments/:id/draw', async (req, res) => {
    try {
        const t = await tournamentIn(req, res, ['open']); if (!t) return;
        const [reg] = await req.db.execute('SELECT team_id FROM tournament_teams WHERE tournament_id = ?', [t.id]);
        if (!groupCount(reg.length)) return res.status(400).json({ error: `Groups need 4, 6-8 or 12-16 teams; now there are ${reg.length}` });
        const ids = reg.map((r) => r.team_id);
        const [rated] = await req.db.execute(`SELECT team_id, rating FROM team_battle_stats WHERE team_id IN (${ids.map(() => '?').join(', ')})`, ids);
        const groups = drawGroups(ids.map((id) => ({ team_id: id, rating: (rated.find((r) => r.team_id === id) || { rating: 1000 }).rating })));
        const [moved] = await req.db.execute("UPDATE tournaments SET status = 'groups' WHERE id = ? AND status = 'open'", [t.id]);
        if (!moved.affectedRows) return res.status(409).json({ error: 'This step is not possible in the current stage' });
        for (let g = 0; g < groups.length; g++) {
            for (const team of groups[g]) await req.db.execute('UPDATE tournament_teams SET group_no = ?, seed_rating = ? WHERE tournament_id = ? AND team_id = ?', [g + 1, team.rating, t.id, team.team_id]);
            const rounds = roundRobin(groups[g].map((x) => x.team_id));
            for (let r = 0; r < rounds.length; r++) {
                for (const [a, b] of rounds[r]) await req.db.execute("INSERT INTO tournament_matches (tournament_id, stage, group_no, round_no, team_a, team_b) VALUES (?, 'group', ?, ?, ?, ?)", [t.id, g + 1, r + 1, a, b]);
            }
        }
        const [people] = await req.db.execute(`SELECT DISTINCT user_id FROM team_members WHERE status = 'active' AND team_id IN (${ids.map(() => '?').join(', ')})`, ids);
        await Promise.all(people.map((p) => notify(req.db, p.user_id, { kind: 'tournament', title: "Turnir guruhlari e'lon qilindi", body: t.title, page: 'musobaqalar', refId: t.id })));
        res.json({ status: 'groups', groups: groups.length });
    } catch (e) { fail(res, e); }
});

// Starts the next stage: a group round, then the playoffs (quarter-final, semi-final, final). ONE set of AI questions for the whole stage
// (each team plays once per stage, so nobody answers the same question twice); one battle per match, running at once.
async function runStage(req, res, t, slot, label) {
    // The admin's own questions for this stage come first; they cost nothing and need no AI
    const [own] = await req.db.execute('SELECT question, options, correct, explanation FROM tournament_questions WHERE tournament_id = ? AND slot = ? ORDER BY position', [t.id, slot]);
    if (own.length) return { questions: own.map((r) => ({ q: r.question, options: JSON.parse(r.options), answer: r.correct, explanation: r.explanation || '' })), own: true };
    if (!ai.isLive()) return res.status(503).json({ error: 'The AI that prepares quiz questions is not connected yet' });
    let made;
    try { made = await ai.battleQuiz({ topic: t.topic, title: label }); } catch (e) {
        console.error('Tournament quiz failed:', e.message);
        return res.status(502).json({ error: 'Could not prepare the questions. Try again in a minute' });
    }
    return made;
}

async function tellTeams(req, t, teamIds, title) {
    const ids = [...teamIds];
    if (!ids.length) return;
    const [people] = await req.db.execute(`SELECT DISTINCT user_id FROM team_members WHERE status = 'active' AND team_id IN (${ids.map(() => '?').join(', ')})`, ids);
    await Promise.all(people.map((p) => notify(req.db, p.user_id, { kind: 'tournament', title, body: t.title, page: 'musobaqalar', refId: t.id })));
}

router.post('/tournaments/:id/start-round', async (req, res) => {
    try {
        const t = await tournamentIn(req, res, ['groups', 'playoffs']); if (!t) return;
        const [one] = await tournaments.loadTournaments(req.db, 0, t.id);
        if (one.next_round !== null) {
            // ---- a group round ----
            if (!one.round_ready) return res.status(409).json({ error: 'The previous round is not finished yet' });
            const round = one.next_round;
            const title = `${t.title} · ${round}-tur`;
            const made = await runStage(req, res, t, slotOfRound(round), title); if (!made.questions) return;
            const round_matches = one.matches.filter((m) => m.stage === 'group' && m.round_no === round);
            const teamIds = new Set();
            for (const m of round_matches) {
                const id = await battles.createTournamentBattle(req.db, { title: `${title} · ${String.fromCharCode(64 + m.group_no)} guruhi`, topic: t.topic, days: t.round_days, teamA: m.team_a, teamB: m.team_b, createdBy: req.user.userId, questions: made.questions });
                const [claim] = await req.db.execute('UPDATE tournament_matches SET battle_id = ? WHERE id = ? AND battle_id IS NULL', [id, m.id]);
                if (!claim.affectedRows) { await req.db.execute("UPDATE battles SET status = 'cancelled' WHERE id = ?", [id]); continue; }   // a second click got there first
                teamIds.add(m.team_a); teamIds.add(m.team_b);
            }
            await tellTeams(req, t, teamIds, `${round}-tur boshlandi`);
            return res.json({ round, matches: round_matches.length });
        }
        // ---- playoffs ----
        if (!one.groups_finished) return res.status(409).json({ error: 'The group stage is not finished yet' });
        let stage; let pairs;
        if (one.playoff_stage === null) {
            pairs = playoffPairs(one.groups); stage = pairs && firstStage(pairs.length);
            if (!stage) return res.status(409).json({ error: 'The playoffs cannot be made from these groups' });
        } else {
            if (one.playoff_stage === 'final') return res.status(409).json({ error: 'The tournament is over' });
            if (!one.stage_finished) return res.status(409).json({ error: 'The previous stage is not finished yet' });
            stage = STAGES[STAGES.indexOf(one.playoff_stage) + 1];
            pairs = nextPairs(one.matches.filter((m) => m.stage === one.playoff_stage).map((m) => m.winner));
        }
        const title = `${t.title} · ${STAGE_TITLE[stage]}`;
        const made = await runStage(req, res, t, stage, title); if (!made.questions) return;
        // Write the matches first; if a second click wrote them too, only one set stays
        const round_no = STAGES.indexOf(stage) + 1;
        const rows = [];
        for (const [a, b] of pairs) {
            const [ins] = await req.db.execute("INSERT INTO tournament_matches (tournament_id, stage, group_no, round_no, team_a, team_b) VALUES (?, ?, NULL, ?, ?, ?)", [t.id, stage, round_no, a, b]);
            rows.push({ id: ins.insertId, a, b });
        }
        const [have] = await req.db.execute('SELECT id FROM tournament_matches WHERE tournament_id = ? AND stage = ?', [t.id, stage]);
        if (have.length > pairs.length) {
            for (const r of rows) await req.db.execute('DELETE FROM tournament_matches WHERE id = ?', [r.id]);
            return res.status(409).json({ error: 'This stage has already started' });
        }
        const teamIds = new Set();
        for (const r of rows) {
            const id = await battles.createTournamentBattle(req.db, { title, topic: t.topic, days: t.round_days, teamA: r.a, teamB: r.b, createdBy: req.user.userId, questions: made.questions });
            await req.db.execute('UPDATE tournament_matches SET battle_id = ? WHERE id = ?', [id, r.id]);
            teamIds.add(r.a); teamIds.add(r.b);
        }
        if (t.status === 'groups') await req.db.execute("UPDATE tournaments SET status = 'playoffs' WHERE id = ? AND status = 'groups'", [t.id]);
        await tellTeams(req, t, teamIds, `${STAGE_TITLE[stage]} boshlandi`);
        res.json({ stage, matches: rows.length });
    } catch (e) { fail(res, e); }
});

// ---- The admin's own questions per stage ----
const slotIn = (req, res) => {
    const slot = String(req.params.slot || '');
    if (!SLOTS.includes(slot)) { res.status(400).json({ error: 'Unknown stage' }); return null; }
    return slot;
};

router.get('/tournaments/:id/questions', async (req, res) => {
    try {
        const t = await tournamentIn(req, res, ['open', 'groups', 'playoffs']); if (!t) return;
        const [rows] = await req.db.execute('SELECT slot, position, question, options, correct, explanation FROM tournament_questions WHERE tournament_id = ? ORDER BY slot, position', [t.id]);
        const slots = {};
        rows.forEach((r) => { (slots[r.slot] = slots[r.slot] || []).push({ q: r.question, options: JSON.parse(r.options), answer: r.correct, explanation: r.explanation || '' }); });
        res.json({ slots, all_slots: SLOTS, limits: QUESTION_LIMITS });
    } catch (e) { fail(res, e); }
});

// Replaces every question of one stage; an empty list goes back to the AI. Battles that already started keep their own copy.
router.put('/tournaments/:id/questions/:slot', async (req, res) => {
    try {
        const t = await tournamentIn(req, res, ['open', 'groups', 'playoffs']); if (!t) return;
        const slot = slotIn(req, res); if (!slot) return;
        const clean = cleanQuestions(req.body && req.body.questions);
        if (clean.error) return res.status(400).json({ error: clean.error });
        await req.db.execute('DELETE FROM tournament_questions WHERE tournament_id = ? AND slot = ?', [t.id, slot]);
        for (let i = 0; i < clean.questions.length; i++) {
            const x = clean.questions[i];
            await req.db.execute('INSERT INTO tournament_questions (tournament_id, slot, position, question, options, correct, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)', [t.id, slot, i + 1, x.q, JSON.stringify(x.options), x.answer, x.explanation || null]);
        }
        res.json({ slot, count: clean.questions.length });
    } catch (e) { fail(res, e); }
});

// ---- "Baraban" question sets ----
router.get('/wheel-sets', async (req, res) => {
    try {
        const [rows] = await req.db.execute('SELECT id, title, questions FROM wheel_sets ORDER BY id DESC', []);
        res.json({ sets: rows.map((r) => { let n = 0; try { n = JSON.parse(r.questions).length; } catch (e) { n = 0; } return { id: r.id, title: r.title, count: n }; }), limits: QUESTION_LIMITS });
    } catch (e) { fail(res, e); }
});

router.post('/wheel-sets', async (req, res) => {
    try {
        const title = typeof (req.body && req.body.title) === 'string' ? req.body.title.trim() : '';
        if (title.length < 3 || title.length > 120) return res.status(400).json({ error: 'The title must be 3 to 120 characters' });
        const clean = cleanQuestions(req.body.questions);
        if (clean.error) return res.status(400).json({ error: clean.error });
        if (!clean.questions.length) return res.status(400).json({ error: `A set needs ${QUESTION_LIMITS.min} to ${QUESTION_LIMITS.max} questions` });
        const [ins] = await req.db.execute('INSERT INTO wheel_sets (title, questions, created_by) VALUES (?, ?, ?)', [title, JSON.stringify(clean.questions), req.user.userId]);
        res.status(201).json({ id: ins.insertId, count: clean.questions.length });
    } catch (e) { fail(res, e); }
});

router.delete('/wheel-sets/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id); if (!id) return res.status(400).json({ error: 'Invalid set id' });
        const [used] = await req.db.execute('SELECT COUNT(*) AS n FROM wheel_sessions WHERE set_id = ?', [id]);
        if (Number(used[0].n) > 0) return res.status(409).json({ error: 'This set was already played and cannot be deleted' });
        const [del] = await req.db.execute('DELETE FROM wheel_sets WHERE id = ?', [id]);
        if (!del.affectedRows) return res.status(404).json({ error: 'Question set not found' });
        res.json({ deleted: true });
    } catch (e) { fail(res, e); }
});

router.post('/tournaments/:id/cancel', async (req, res) => {
    try {
        const t = await tournamentIn(req, res, ['open', 'groups', 'playoffs']); if (!t) return;
        await req.db.execute("UPDATE tournaments SET status = 'cancelled' WHERE id = ?", [t.id]);
        // Matches still being played stop with the tournament
        const [one] = await tournaments.loadTournaments(req.db, 0, t.id);
        const running = one ? one.matches.filter((m) => m.state === 'active').map((m) => m.battle_id) : [];
        if (running.length) await req.db.execute(`UPDATE battles SET status = 'cancelled' WHERE status = 'active' AND id IN (${running.map(() => '?').join(', ')})`, running);
        res.json({ status: 'cancelled' });
    } catch (e) { fail(res, e); }
});

module.exports = router;
