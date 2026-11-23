// In-memory stand-in for the database, for the team and chat routes (no MySQL needed).
// It understands exactly the SQL these routes send; any other query throws so a changed query cannot slip by.
const norm = (q) => q.replace(/\s+/g, ' ').trim();

function createTeamsFake() {
    const s = {
        users: { 1: 'Captain', 2: 'Ali', 3: 'Vali', 4: 'Dilnoza' },
        emails: { 1: 'captain@x.uz', 2: 'ali@x.uz', 3: 'vali@x.uz', 4: 'dilnoza@x.uz' },
        blocked: {}, interests: {}, notices: [],
        teams: [], members: [], messages: [], resources: [], votes: [], id: 1, mid: 1, memberId: 1, rid: 1, events: [], going: [], eid: 1, battles: [], bteams: [], bid: 1, questions: [], qid: 1, answers: [], results: []
    };
    const now = () => Date.now();
    const find = (t, u) => s.members.find((m) => m.team_id === t && m.user_id === u);
    const mutedSeconds = (m) => (m && m.muted_until ? Math.max(0, Math.ceil((m.muted_until - now()) / 1000)) : 0);
    const activeCount = (t) => s.members.filter((m) => m.team_id === t && m.status === 'active').length;
    const addMember = (team_id, user_id, status, extra = {}) =>
        s.members.push({ id: s.memberId++, team_id, user_id, status, anonymous: 0, invited_by: null, muted_until: null, ...extra });

    async function execute(raw, p = []) {
        const q = norm(raw);

        // ---- teams
        if (q.startsWith('INSERT INTO teams (')) {
            if (s.teams.some((t) => t.name === p[0])) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
            const t = { id: s.id++, name: p[0], description: p[1], direction: p[2], sphere: p[3], goals: p[4], captain_id: p[5], invite_mode: 'admin', recruiting: 1, topics_done: 0, achievements: 0, created_at: '2026-11-13T09:00:00.000Z' };
            s.teams.push(t);
            return [{ insertId: t.id }];
        }
        if (q.startsWith('SELECT id, name, captain_id, invite_mode, recruiting FROM teams WHERE id = ?')) return [s.teams.filter((t) => t.id === p[0])];
        if (q.startsWith('SELECT COUNT(*) AS n FROM teams WHERE captain_id')) return [[{ n: s.teams.filter((t) => t.captain_id === p[0]).length }]];
        if (q.startsWith('SELECT t.id, t.name')) {
            // p = [viewer x3] for the list, [viewer x3, teamId] for one team; newest first like the real ORDER BY
            const rows = s.teams.filter((t) => p.length < 4 || t.id === p[3]).sort((a, b) => b.id - a.id);
            return [rows.map((t) => {
                const mine = find(t.id, p[0]);
                return {
                    ...t,
                    captain_name: s.users[t.captain_id],
                    members: activeCount(t.id),
                    my_status: mine ? mine.status : null,
                    my_invited_by: mine ? mine.invited_by : null,
                    pending_requests: t.captain_id === p[0] ? s.members.filter((m) => m.team_id === t.id && m.status === 'pending' && m.invited_by === null).length : 0
                };
            })];
        }
        if (q.startsWith('UPDATE teams SET ')) {
            const cols = q.match(/^UPDATE teams SET (.+) WHERE id = \?$/)[1].split(', ').map((c) => c.replace(' = ?', ''));
            const team = s.teams.find((t) => t.id === p[cols.length]);
            cols.forEach((c, i) => {
                if (c === 'name' && s.teams.some((t) => t.id !== team.id && t.name === p[i])) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
            });
            cols.forEach((c, i) => { team[c] = p[i]; });
            return [{ affectedRows: 1 }];
        }
        if (q === 'DELETE FROM teams WHERE id = ?') {
            s.teams = s.teams.filter((t) => t.id !== p[0]);
            s.members = s.members.filter((m) => m.team_id !== p[0]);
            s.messages = s.messages.filter((m) => m.team_id !== p[0]);
            return [{ affectedRows: 1 }];
        }

        // ---- members
        if (q.startsWith("INSERT INTO team_members (team_id, user_id, status) VALUES (?, ?, 'active')")) { addMember(p[0], p[1], 'active'); return [{}]; }
        if (q.startsWith('INSERT INTO team_members (team_id, user_id, status, anonymous)')) { addMember(p[0], p[1], 'pending', { anonymous: p[2] }); return [{}]; }
        if (q.startsWith('INSERT INTO team_members (team_id, user_id, status, invited_by)')) { addMember(p[0], p[1], 'pending', { invited_by: p[2] }); return [{}]; }
        if (q.startsWith('SELECT status, anonymous, invited_by')) {
            const m = find(p[0], p[1]);
            return [m ? [{ status: m.status, anonymous: m.anonymous, invited_by: m.invited_by, muted: mutedSeconds(m) > 0 ? 1 : 0, muted_seconds: mutedSeconds(m) }] : []];
        }
        if (q.startsWith("SELECT COUNT(*) AS n FROM team_members WHERE team_id = ? AND status = 'active'")) return [[{ n: activeCount(p[0]) }]];
        if (q.startsWith('SELECT m.user_id, m.status, m.anonymous, m.invited_by')) {
            return [s.members.filter((m) => m.team_id === p[0]).map((m) => ({ ...m, muted_seconds: mutedSeconds(m), full_name: s.users[m.user_id] }))];
        }
        if (q.startsWith('SELECT id, full_name FROM users WHERE LOWER(email) = ?')) {
            const id = Object.keys(s.emails).map(Number).find((u) => s.emails[u] === p[0] && !s.blocked[u]);
            return [id ? [{ id, full_name: s.users[id] }] : []];
        }
        if (q.startsWith("UPDATE team_members SET status = 'active'")) {
            const wantInvited = q.includes('invited_by IS NOT NULL');
            const m = find(p[0], p[1]);
            const ok = m && m.status === 'pending' && (wantInvited ? m.invited_by !== null : m.invited_by === null);
            if (ok) m.status = 'active';
            return [{ affectedRows: ok ? 1 : 0 }];
        }
        if (q.startsWith('UPDATE team_members SET muted_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)')) {
            const m = find(p[1], p[2]);
            if (!m || m.status !== 'active') return [{ affectedRows: 0 }];
            m.muted_until = now() + p[0] * 60000;
            return [{ affectedRows: 1 }];
        }
        if (q.startsWith('UPDATE team_members SET muted_until = NULL')) {
            const m = find(p[0], p[1]);
            if (m) m.muted_until = null;
            return [{ affectedRows: m ? 1 : 0 }];
        }
        if (q.startsWith('DELETE FROM team_members WHERE team_id = ? AND user_id = ?')) {
            const onlyInvitations = q.includes('invited_by IS NOT NULL');
            const n = s.members.length;
            s.members = s.members.filter((m) => !(m.team_id === p[0] && m.user_id === p[1] && (!onlyInvitations || (m.status === 'pending' && m.invited_by !== null))));
            return [{ affectedRows: n - s.members.length }];
        }

        // ---- activity, interests, notices
        if (q.startsWith('SELECT team_id, user_id, COUNT(*) AS n FROM team_messages WHERE created_at >=')) {
            const from = now() - 7 * 24 * 3600 * 1000; const g = {};
            s.messages.filter((m) => m.deleted_at === null && m.created_at >= from).forEach((m) => { const k = m.team_id + ':' + m.user_id; g[k] = (g[k] || 0) + 1; });
            return [Object.entries(g).map(([k, n]) => ({ team_id: Number(k.split(':')[0]), user_id: Number(k.split(':')[1]), n }))];
        }
        if (q === 'SELECT direction FROM user_interests WHERE user_id = ?') return [(s.interests[p[0]] || []).map((direction) => ({ direction }))];
        if (q === 'DELETE FROM user_interests WHERE user_id = ?') { s.interests[p[0]] = []; return [{}]; }
        if (q.startsWith('INSERT INTO user_interests')) { (s.interests[p[0]] = s.interests[p[0]] || []).push(p[1]); return [{}]; }
        if (q.startsWith('INSERT INTO notifications')) { s.notices.push({ user_id: p[0], kind: p[1], title: p[2], body: p[3], page: p[4], ref_id: p[5] }); return [{ insertId: s.notices.length }]; }

        // ---- resources
        if (q.startsWith('SELECT r.id, r.user_id, r.title, r.url, r.note, r.created_at, u.full_name, tm.anonymous FROM team_resources r')) {
            return [s.resources.filter((r) => r.team_id === p[0]).sort((a, b) => b.id - a.id).map((r) => ({ ...r, full_name: s.users[r.user_id], anonymous: (find(r.team_id, r.user_id) || {}).anonymous || 0 }))];
        }
        if (q === 'SELECT resource_id, user_id FROM team_resource_votes WHERE team_id = ?') return [s.votes.filter((v) => v.team_id === p[0])];
        if (q.startsWith('SELECT COUNT(*) AS n FROM team_resources WHERE team_id = ? AND user_id = ?')) return [[{ n: s.resources.filter((r) => r.team_id === p[0] && r.user_id === p[1]).length }]];
        if (q.startsWith('INSERT INTO team_resources')) { const r = { id: s.rid++, team_id: p[0], user_id: p[1], title: p[2], url: p[3], note: p[4], created_at: '2026-11-22T09:00:00.000Z' }; s.resources.push(r); return [{ insertId: r.id }]; }
        if (q === 'SELECT id, user_id FROM team_resources WHERE id = ? AND team_id = ?') return [s.resources.filter((r) => r.id === p[0] && r.team_id === p[1])];
        if (q === 'SELECT resource_id FROM team_resource_votes WHERE resource_id = ? AND user_id = ?') return [s.votes.filter((v) => v.resource_id === p[0] && v.user_id === p[1])];
        if (q === 'DELETE FROM team_resource_votes WHERE resource_id = ? AND user_id = ?') { s.votes = s.votes.filter((v) => !(v.resource_id === p[0] && v.user_id === p[1])); return [{}]; }
        if (q.startsWith('INSERT INTO team_resource_votes')) { s.votes.push({ resource_id: p[0], user_id: p[1], team_id: p[2] }); return [{}]; }
        if (q === 'DELETE FROM team_resource_votes WHERE resource_id = ?') { s.votes = s.votes.filter((v) => v.resource_id !== p[0]); return [{}]; }
        if (q === 'DELETE FROM team_resources WHERE id = ? AND team_id = ?') { s.resources = s.resources.filter((r) => !(r.id === p[0] && r.team_id === p[1])); return [{}]; }

        // ---- battles
        if (q.startsWith('SELECT DISTINCT bt.battle_id FROM battle_teams bt JOIN team_members m')) {
            const mine = s.members.filter((m) => m.user_id === p[0] && m.status === 'active').map((m) => m.team_id);
            return [[...new Set(s.bteams.filter((b) => mine.includes(b.team_id)).map((b) => b.battle_id))].map((battle_id) => ({ battle_id }))];
        }
        if (q.startsWith('SELECT id, title, topic, kind, status, duration_days, host_team_id, DATE_FORMAT(starts_at')) {
            const iso = (d) => (d ? d.toISOString().slice(0, 19) + 'Z' : null);
            return [s.battles.filter((b) => p.includes(b.id)).map((b) => ({ ...b, starts_at: iso(b.starts_at), ends_at: iso(b.ends_at) }))];
        }
        if (q.startsWith('SELECT bt.battle_id, bt.team_id, bt.state, t.name, t.captain_id FROM battle_teams bt JOIN teams t')) {
            return [s.bteams.filter((b) => p.includes(b.battle_id)).map((b) => { const t = s.teams.find((x) => x.id === b.team_id); return { ...b, name: t.name, captain_id: t.captain_id }; })];
        }
        if (q.startsWith('SELECT COUNT(*) AS n FROM battle_teams a JOIN battle_teams o')) {
            const both = (id) => s.bteams.some((b) => b.battle_id === id && b.team_id === p[0]) && s.bteams.some((b) => b.battle_id === id && b.team_id === p[1]);
            return [[{ n: s.battles.filter((b) => b.status !== 'cancelled' && both(b.id)).length }]];
        }
        if (q.startsWith('SELECT COUNT(*) AS n FROM battle_teams bt JOIN battles x ON x.id = bt.battle_id WHERE bt.team_id = ?')) {
            return [[{ n: s.bteams.filter((b) => b.team_id === p[0] && ['invited', 'active'].includes(s.battles.find((x) => x.id === b.battle_id).status)).length }]];
        }
        if (q.startsWith('INSERT INTO battles (')) { const b = { id: s.bid++, title: p[0], topic: p[1], kind: p[2], status: 'invited', duration_days: p[3], host_team_id: p[4], created_by: p[5], starts_at: null, ends_at: null }; s.battles.push(b); return [{ insertId: b.id }]; }
        if (q.startsWith('INSERT INTO battle_teams (battle_id, team_id, state)')) { s.bteams.push({ battle_id: p[0], team_id: p[1], state: q.includes("'host'") ? 'host' : 'invited' }); return [{}]; }
        if (q === 'SELECT id, status, host_team_id, title, duration_days, kind, topic FROM battles WHERE id = ?') return [s.battles.filter((b) => b.id === p[0])];
        if (q.startsWith('SELECT bt.team_id, t.name FROM battle_teams bt JOIN teams t ON t.id = bt.team_id WHERE bt.battle_id = ? AND t.captain_id = ?')) {
            return [s.bteams.filter((b) => b.battle_id === p[0] && b.state === 'invited').map((b) => ({ team_id: b.team_id, t: s.teams.find((x) => x.id === b.team_id) })).filter((x) => x.t.captain_id === p[1]).map((x) => ({ team_id: x.team_id, name: x.t.name }))];
        }
        if (q.startsWith('UPDATE battle_teams SET state = ?')) { const r = s.bteams.find((b) => b.battle_id === p[1] && b.team_id === p[2]); r.state = p[0]; return [{}]; }
        if (q === 'SELECT state FROM battle_teams WHERE battle_id = ?') return [s.bteams.filter((b) => b.battle_id === p[0]).map((b) => ({ state: b.state }))];
        if (q === 'SELECT team_id, state FROM battle_teams WHERE battle_id = ?') return [s.bteams.filter((b) => b.battle_id === p[0]).map((b) => ({ team_id: b.team_id, state: b.state }))];
        if (q.startsWith("UPDATE battles SET status = 'cancelled'")) { const b = s.battles.find((x) => x.id === p[0]); if (b) b.status = 'cancelled'; return [{}]; }
        if (q.startsWith("UPDATE battles SET status = 'active'")) { const b = s.battles.find((x) => x.id === p[1]); b.status = 'active'; b.starts_at = new Date(); b.ends_at = new Date(Date.now() + p[0] * 86400000); return [{}]; }
        if (q.startsWith("SELECT DISTINCT m.user_id FROM battle_teams bt JOIN team_members m")) {
            const playing = s.bteams.filter((b) => b.battle_id === p[0] && ['host', 'accepted'].includes(b.state)).map((b) => b.team_id);
            return [[...new Set(s.members.filter((m) => playing.includes(m.team_id) && m.status === 'active' && m.user_id !== p[1]).map((m) => m.user_id))].map((user_id) => ({ user_id }))];
        }
        if (q.startsWith("SELECT t.captain_id FROM battle_teams bt JOIN teams t ON t.id = bt.team_id WHERE bt.battle_id = ? AND bt.state IN ('invited', 'accepted')")) {
            return [s.bteams.filter((b) => b.battle_id === p[0] && ['invited', 'accepted'].includes(b.state)).map((b) => ({ captain_id: s.teams.find((x) => x.id === b.team_id).captain_id }))];
        }

        // ---- quiz battles
        if (q.startsWith('INSERT INTO battle_questions')) { s.questions.push({ id: s.qid++, battle_id: p[0], position: p[1], question: p[2], options: p[3], correct: p[4], explanation: p[5] }); return [{}]; }
        if (q.startsWith('SELECT battle_id, team_id, score, correct_total, participants, place FROM battle_results')) return [s.results.filter((r) => p.includes(r.battle_id))];
        if (q.startsWith("SELECT bt.battle_id, bt.team_id FROM battle_teams bt JOIN team_members m")) {
            const mine = s.members.filter((m) => m.user_id === p[0] && m.status === 'active').map((m) => m.team_id);
            return [s.bteams.filter((b) => mine.includes(b.team_id) && ['host', 'accepted'].includes(b.state) && p.slice(1).includes(b.battle_id))];
        }
        if (q.startsWith("SELECT bt.team_id FROM battle_teams bt JOIN team_members m")) {
            const mine = s.members.filter((m) => m.user_id === p[1] && m.status === 'active').map((m) => m.team_id);
            return [s.bteams.filter((b) => b.battle_id === p[0] && mine.includes(b.team_id) && ['host', 'accepted'].includes(b.state)).map((b) => ({ team_id: b.team_id }))];
        }
        if (q.startsWith("SELECT id FROM battles WHERE id IN (")) {
            return [s.battles.filter((b) => p.includes(b.id) && b.status === 'active' && b.kind === 'quiz' && b.ends_at <= new Date()).map((b) => ({ id: b.id }))];
        }
        if (q.startsWith("SELECT team_id, state FROM battle_teams WHERE battle_id = ? AND state IN ('host', 'accepted')")) return [s.bteams.filter((b) => b.battle_id === p[0] && ['host', 'accepted'].includes(b.state)).map((b) => ({ team_id: b.team_id, state: b.state }))];
        if (q.startsWith('SELECT user_id, team_id, SUM(correct) AS ok, COUNT(*) AS n FROM battle_answers')) {
            const out = {};
            s.answers.filter((a) => a.battle_id === p[0]).forEach((a) => { const k = a.user_id; out[k] = out[k] || { user_id: a.user_id, team_id: a.team_id, ok: 0, n: 0 }; out[k].ok += a.correct; out[k].n += 1; });
            return [Object.values(out)];
        }
        if (q === "UPDATE battles SET status = 'finished' WHERE id = ? AND status = 'active'") { const b = s.battles.find((x) => x.id === p[0] && x.status === 'active'); if (b) b.status = 'finished'; return [{ affectedRows: b ? 1 : 0 }]; }
        if (q.startsWith('INSERT INTO battle_results')) { s.results.push({ battle_id: p[0], team_id: p[1], score: p[2], correct_total: p[3], participants: p[4], place: p[5] }); return [{}]; }
        if (q.startsWith('SELECT id, position, question, options, correct, explanation FROM battle_questions')) return [s.questions.filter((x) => x.battle_id === p[0]).sort((a, b) => a.position - b.position)];
        if (q === 'SELECT question_id, choice, correct FROM battle_answers WHERE battle_id = ? AND user_id = ?') return [s.answers.filter((a) => a.battle_id === p[0] && a.user_id === p[1])];
        if (q === 'SELECT id, correct FROM battle_questions WHERE id = ? AND battle_id = ?') return [s.questions.filter((x) => x.id === p[0] && x.battle_id === p[1])];
        if (q.startsWith('INSERT INTO battle_answers')) {
            if (s.answers.some((a) => a.question_id === p[0] && a.user_id === p[1])) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
            s.answers.push({ question_id: p[0], user_id: p[1], battle_id: p[2], team_id: p[3], choice: p[4], correct: p[5] }); return [{}];
        }
        if (q === 'SELECT COUNT(*) AS n FROM battle_answers WHERE battle_id = ? AND user_id = ?') return [[{ n: s.answers.filter((a) => a.battle_id === p[0] && a.user_id === p[1]).length }]];

        // ---- meetups (starts_at is kept as a Date)
        if (q.startsWith("SELECT id, title, place, note, DATE_FORMAT(starts_at, '%Y-%m-%dT%H:%i:%sZ') AS starts_at FROM team_events")) {
            const from = now() - 86400000;
            return [s.events.filter((e) => e.team_id === p[0] && e.starts_at.getTime() >= from).sort((a, b) => a.starts_at - b.starts_at).map((e) => ({ id: e.id, title: e.title, place: e.place, note: e.note, starts_at: e.starts_at.toISOString().slice(0, 19) + 'Z' }))];
        }
        if (q === 'SELECT event_id, user_id FROM team_event_going WHERE team_id = ?') return [s.going.filter((g) => g.team_id === p[0])];
        if (q.startsWith('SELECT COUNT(*) AS n FROM team_events WHERE team_id = ?')) return [[{ n: s.events.filter((e) => e.team_id === p[0] && e.starts_at.getTime() >= now()).length }]];
        if (q.startsWith('INSERT INTO team_events')) { const e = { id: s.eid++, team_id: p[0], user_id: p[1], title: p[2], place: p[3], note: p[4], starts_at: new Date(p[5].replace(' ', 'T') + 'Z') }; s.events.push(e); return [{ insertId: e.id }]; }
        if (q.startsWith("SELECT user_id FROM team_members WHERE team_id = ? AND status = 'active' AND user_id <> ?")) return [s.members.filter((m) => m.team_id === p[0] && m.status === 'active' && m.user_id !== p[1]).map((m) => ({ user_id: m.user_id }))];
        if (q === 'SELECT id FROM team_events WHERE id = ? AND team_id = ?') return [s.events.filter((e) => e.id === p[0] && e.team_id === p[1]).map((e) => ({ id: e.id }))];
        if (q === 'SELECT event_id FROM team_event_going WHERE event_id = ? AND user_id = ?') return [s.going.filter((g) => g.event_id === p[0] && g.user_id === p[1])];
        if (q === 'DELETE FROM team_event_going WHERE event_id = ? AND user_id = ?') { s.going = s.going.filter((g) => !(g.event_id === p[0] && g.user_id === p[1])); return [{}]; }
        if (q.startsWith('INSERT INTO team_event_going')) { s.going.push({ event_id: p[0], user_id: p[1], team_id: p[2] }); return [{}]; }
        if (q === 'DELETE FROM team_event_going WHERE event_id = ?') { s.going = s.going.filter((g) => g.event_id !== p[0]); return [{}]; }
        if (q === 'DELETE FROM team_events WHERE id = ? AND team_id = ?') { s.events = s.events.filter((e) => !(e.id === p[0] && e.team_id === p[1])); return [{}]; }

        // ---- chat
        if (q.startsWith('SELECT COUNT(*) AS n FROM team_messages WHERE team_id = ? AND user_id = ?')) {
            return [[{ n: s.messages.filter((m) => m.team_id === p[0] && m.user_id === p[1] && m.created_at > now() - p[2] * 1000).length }]];
        }
        if (q.startsWith('INSERT INTO team_messages')) {
            const m = { id: s.mid++, team_id: p[0], user_id: p[1], body: p[2], created_at: now(), deleted_at: null };
            s.messages.push(m);
            return [{ insertId: m.id }];
        }
        if (q.startsWith('SELECT m.id, m.user_id, m.body, m.created_at, u.full_name, tm.anonymous FROM team_messages m')) {
            const limit = Number((q.match(/LIMIT (\d+)/) || [])[1]);
            let rows = s.messages.filter((m) => m.team_id === p[0] && m.deleted_at === null);
            if (q.includes('AND m.id > ?')) rows = rows.filter((m) => m.id > p[1]).sort((a, b) => a.id - b.id);
            else {
                if (q.includes('AND m.id < ?')) rows = rows.filter((m) => m.id < p[1]);
                rows = rows.sort((a, b) => b.id - a.id);
            }
            return [rows.slice(0, limit).map((m) => ({ ...m, created_at: new Date(m.created_at), full_name: s.users[m.user_id], anonymous: (find(m.team_id, m.user_id) || {}).anonymous || 0 }))];
        }
        if (q.startsWith('SELECT id FROM team_messages WHERE team_id = ? AND deleted_at IS NOT NULL AND id >= ?')) {
            return [s.messages.filter((m) => m.team_id === p[0] && m.deleted_at !== null && m.id >= p[1]).map((m) => ({ id: m.id }))];
        }
        if (q.startsWith('UPDATE team_messages SET deleted_at = NOW()')) {
            const m = s.messages.find((x) => x.id === p[0] && x.team_id === p[1] && x.deleted_at === null);
            if (m) { m.deleted_at = now(); m.body = ''; }
            return [{ affectedRows: m ? 1 : 0 }];
        }
        throw new Error('Unexpected query in test: ' + q);
    }

    return { s, db: { execute, query: async () => [[]] }, addMember };
}

module.exports = { createTeamsFake };
