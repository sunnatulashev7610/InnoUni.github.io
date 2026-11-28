// "Baraban": a live game for a team. The team admin opens a session with a question set the platform admin wrote.
// The SERVER draws the member and the question and checks the answer, so nobody can cheat from the browser.
// Mounted at /api/wheel (feature "teams").
const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId } = require('../utils/validation');
const { getTeam, getMember, countActive } = require('../utils/teamAccess');
const { notify } = require('../utils/notify');

const WHEEL = { answerSeconds: 60, graceSeconds: 5, minPlayers: 2 };
const router = express.Router();
router.use(authenticateToken);

const serverError = (res, e) => { console.error(e); res.status(500).json({ error: 'Server error' }); };
const pickOne = (list) => list[crypto.randomInt(list.length)];
const parseQuestions = (text) => { try { const x = JSON.parse(text); return Array.isArray(x) ? x : []; } catch (e) { return []; } };

async function loadSession(db, id) {
    const [rows] = await db.execute(
        'SELECT s.id, s.team_id, s.host_id, s.status, s.current_user_id, s.current_q, IFNULL(TIMESTAMPDIFF(SECOND, s.asked_at, NOW()), 0) AS asked_seconds, w.title, w.questions ' +
        'FROM wheel_sessions s JOIN wheel_sets w ON w.id = s.set_id WHERE s.id = ?', [id]);
    if (!rows.length) return null;
    const r = rows[0];
    return { id: r.id, team_id: r.team_id, host_id: r.host_id, status: r.status, current_user_id: r.current_user_id, current_q: r.current_q, asked_seconds: Number(r.asked_seconds) || 0, title: r.title, questions: parseQuestions(r.questions) };
}
const loadTurns = async (db, id) => (await db.execute('SELECT t.user_id, t.q_index, t.choice, t.correct, u.full_name FROM wheel_turns t JOIN users u ON u.id = t.user_id WHERE t.session_id = ? ORDER BY t.id', [id]))[0];
const loadRoster = async (db, teamId) => (await db.execute("SELECT m.user_id, u.full_name FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ? AND m.status = 'active' ORDER BY m.user_id", [teamId]))[0];

// The session for a member of its team: 404 if there is none, 403 for everybody else
async function sessionFor(req, res) {
    const id = parseId(req.params.id); if (!id) { res.status(400).json({ error: 'Invalid session id' }); return null; }
    const s = await loadSession(req.db, id);
    if (!s) { res.status(404).json({ error: 'Session not found' }); return null; }
    const m = await getMember(req.db, s.team_id, req.user.userId);
    if (!m || m.status !== 'active') { res.status(403).json({ error: 'Only members of this team can see the game' }); return null; }
    s.me = req.user.userId; s.is_host = s.host_id === req.user.userId; return s;
}
const hostOnly = (s, res) => { if (!s.is_host) { res.status(403).json({ error: 'Only the person who started the game can do this' }); return false; } return true; };
const mustBeOpen = (s, res) => { if (s.status !== 'open') { res.status(409).json({ error: 'The game is already finished' }); return false; } return true; };

async function record(db, s, userId, qIndex, choice, correct) {
    await db.execute('INSERT INTO wheel_turns (session_id, user_id, q_index, choice, correct) VALUES (?, ?, ?, ?, ?)', [s.id, userId, qIndex, choice, correct ? 1 : 0]);
    await db.execute('UPDATE wheel_sessions SET current_user_id = NULL, current_q = NULL, asked_at = NULL WHERE id = ? AND current_user_id = ?', [s.id, userId]);
}
// Ends the game when everybody has answered or the questions ran out
async function closeIfDone(db, s) {
    const turns = await loadTurns(db, s.id); const roster = await loadRoster(db, s.team_id);
    const done = new Set(turns.map((t) => t.user_id));
    const left = roster.filter((m) => !done.has(m.user_id)).length;
    if (left === 0 || turns.length >= s.questions.length) {
        await db.execute("UPDATE wheel_sessions SET status = 'finished', finished_at = NOW() WHERE id = ? AND status = 'open'", [s.id]);
        return true;
    }
    return false;
}
const expired = (s) => s.current_user_id && s.asked_seconds > WHEEL.answerSeconds;

// Question sets the team admin can choose from
router.get('/sets', async (req, res) => {
    try {
        const [rows] = await req.db.execute('SELECT id, title, questions FROM wheel_sets ORDER BY id DESC', []);
        res.json({ sets: rows.map((r) => ({ id: r.id, title: r.title, count: parseQuestions(r.questions).length })), answer_seconds: WHEEL.answerSeconds, min_players: WHEEL.minPlayers });
    } catch (e) { serverError(res, e); }
});

// Open games of my teams and the latest finished ones
router.get('/mine', async (req, res) => {
    try {
        const base = 'SELECT s.id, s.team_id, t.name AS team_name, w.title FROM wheel_sessions s JOIN teams t ON t.id = s.team_id JOIN wheel_sets w ON w.id = s.set_id JOIN team_members m ON m.team_id = s.team_id ';
        const [open] = await req.db.execute(base + "WHERE s.status = 'open' AND m.user_id = ? AND m.status = 'active' ORDER BY s.id DESC", [req.user.userId]);
        const [recent] = await req.db.execute(base + "WHERE s.status = 'finished' AND m.user_id = ? AND m.status = 'active' ORDER BY s.id DESC LIMIT 5", [req.user.userId]);
        res.json({ open, recent });
    } catch (e) { serverError(res, e); }
});

// The team admin starts a game
router.post('/sessions', async (req, res) => {
    try {
        const teamId = parseId(req.body && req.body.team_id); const setId = parseId(req.body && req.body.set_id);
        if (!teamId || !setId) return res.status(400).json({ error: 'Choose a team and a question set' });
        const team = await getTeam(req.db, teamId);
        if (!team) return res.status(404).json({ error: 'Team not found' });
        if (team.captain_id !== req.user.userId) return res.status(403).json({ error: 'Only the team admin can start the game' });
        const [sets] = await req.db.execute('SELECT id, title, questions FROM wheel_sets WHERE id = ?', [setId]);
        if (!sets.length) return res.status(404).json({ error: 'Question set not found' });
        const players = await countActive(req.db, teamId);
        if (players < WHEEL.minPlayers) return res.status(409).json({ error: `At least ${WHEEL.minPlayers} active members are needed` });
        if (parseQuestions(sets[0].questions).length < players) return res.status(409).json({ error: 'This set has fewer questions than members' });
        const [open] = await req.db.execute("SELECT id FROM wheel_sessions WHERE team_id = ? AND status = 'open'", [teamId]);
        if (open.length) return res.status(409).json({ error: 'The team already has a game in progress', id: open[0].id });
        const [ins] = await req.db.execute('INSERT INTO wheel_sessions (team_id, set_id, host_id) VALUES (?, ?, ?)', [teamId, setId, req.user.userId]);
        const roster = await loadRoster(req.db, teamId);
        await Promise.all(roster.filter((m) => m.user_id !== req.user.userId).map((m) => notify(req.db, m.user_id, { kind: 'team', page: 'musobaqalar', refId: ins.insertId, title: 'Baraban boshlandi', body: `${team.name} jamoasida jonli o'yin: ${sets[0].title}` })));
        res.status(201).json({ id: ins.insertId });
    } catch (e) { serverError(res, e); }
});

// Where the game stands (everybody in the team polls this)
router.get('/sessions/:id', async (req, res) => {
    try {
        const s = await sessionFor(req, res); if (!s) return;
        const turns = await loadTurns(req.db, s.id); const roster = await loadRoster(req.db, s.team_id);
        const done = new Set(turns.map((t) => t.user_id));
        const last = turns.length ? turns[turns.length - 1] : null; const lq = last ? s.questions[last.q_index] : null;
        let current = null;
        if (s.current_user_id && s.status === 'open') {
            const who = roster.find((m) => m.user_id === s.current_user_id); const q = s.questions[s.current_q];
            current = q ? { user_id: s.current_user_id, name: who ? who.full_name : '', question: { q: q.q, options: q.options }, seconds_left: Math.max(0, WHEEL.answerSeconds - s.asked_seconds) } : null;
        }
        res.json({
            id: s.id, team_id: s.team_id, title: s.title, status: s.status, is_host: s.is_host, my_turn: Boolean(current && current.user_id === s.me),
            answer_seconds: WHEEL.answerSeconds, total_questions: s.questions.length,
            remaining: roster.filter((m) => !done.has(m.user_id)).map((m) => ({ user_id: m.user_id, name: m.full_name })),
            turns: turns.map((t) => ({ user_id: t.user_id, name: t.full_name, correct: Boolean(Number(t.correct)) })),
            score: turns.filter((t) => Number(t.correct)).length,
            last: last && lq ? { name: last.full_name, correct: Boolean(Number(last.correct)), timed_out: last.choice === null, q: lq.q, options: lq.options, answer: lq.answer, choice: last.choice, explanation: lq.explanation || '' } : null,
            current
        });
    } catch (e) { serverError(res, e); }
});

// The admin spins: the server draws the member and the question
router.post('/sessions/:id/spin', async (req, res) => {
    try {
        const s = await sessionFor(req, res); if (!s || !hostOnly(s, res) || !mustBeOpen(s, res)) return;
        if (s.current_user_id) {
            if (!expired(s)) return res.status(409).json({ error: 'Someone is answering now' });
            await record(req.db, s, s.current_user_id, s.current_q, null, false);                // time ran out: counts as a miss
            if (await closeIfDone(req.db, s)) return res.json({ finished: true });
        }
        const turns = await loadTurns(req.db, s.id); const roster = await loadRoster(req.db, s.team_id);
        const done = new Set(turns.map((t) => t.user_id)); const usedQ = new Set(turns.map((t) => t.q_index));
        const wheel = roster.filter((m) => !done.has(m.user_id));
        const free = s.questions.map((_, i) => i).filter((i) => !usedQ.has(i));
        if (!wheel.length || !free.length) { await req.db.execute("UPDATE wheel_sessions SET status = 'finished', finished_at = NOW() WHERE id = ? AND status = 'open'", [s.id]); return res.json({ finished: true }); }
        const who = pickOne(wheel); const q = pickOne(free);
        const [upd] = await req.db.execute("UPDATE wheel_sessions SET current_user_id = ?, current_q = ?, asked_at = NOW() WHERE id = ? AND status = 'open' AND current_user_id IS NULL", [who.user_id, q, s.id]);
        if (!upd.affectedRows) return res.status(409).json({ error: 'Someone is answering now' });
        await notify(req.db, who.user_id, { kind: 'team', page: 'musobaqalar', refId: s.id, title: 'Baraban sizni tanladi', body: "Savolga javob bering, vaqt cheklangan." }).catch(() => {});
        res.json({ picked_user_id: who.user_id, wheel: wheel.map((m) => ({ user_id: m.user_id, name: m.full_name })) });
    } catch (e) { serverError(res, e); }
});

// The chosen member answers; the server checks
router.post('/sessions/:id/answer', async (req, res) => {
    try {
        const s = await sessionFor(req, res); if (!s || !mustBeOpen(s, res)) return;
        if (s.current_user_id !== s.me) return res.status(403).json({ error: 'It is not your turn' });
        const choice = req.body && req.body.choice;
        if (!Number.isInteger(choice) || choice < 0 || choice > 3) return res.status(400).json({ error: 'Choose one of the four options' });
        const q = s.questions[s.current_q];
        const late = s.asked_seconds > WHEEL.answerSeconds + WHEEL.graceSeconds;
        const correct = !late && q.answer === choice;
        try { await record(req.db, s, s.me, s.current_q, late ? null : choice, correct); }
        catch (e) { if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You have already answered' }); throw e; }
        const finished = await closeIfDone(req.db, s);
        res.json({ correct, timed_out: late, answer: q.answer, explanation: q.explanation || '', finished });
    } catch (e) { serverError(res, e); }
});

// The admin skips a member who does not answer
router.post('/sessions/:id/skip', async (req, res) => {
    try {
        const s = await sessionFor(req, res); if (!s || !hostOnly(s, res) || !mustBeOpen(s, res)) return;
        if (!s.current_user_id) return res.status(409).json({ error: 'Nobody is answering now' });
        await record(req.db, s, s.current_user_id, s.current_q, null, false);
        res.json({ finished: await closeIfDone(req.db, s) });
    } catch (e) { serverError(res, e); }
});

router.post('/sessions/:id/finish', async (req, res) => {
    try {
        const s = await sessionFor(req, res); if (!s || !hostOnly(s, res) || !mustBeOpen(s, res)) return;
        await req.db.execute("UPDATE wheel_sessions SET status = 'finished', finished_at = NOW(), current_user_id = NULL, current_q = NULL, asked_at = NULL WHERE id = ? AND status = 'open'", [s.id]);
        res.json({ finished: true });
    } catch (e) { serverError(res, e); }
});

module.exports = router;
module.exports.WHEEL = WHEEL;
