// In-memory stand-in for the database, for the team and chat routes (no MySQL needed).
// It understands exactly the SQL these routes send; any other query throws so a changed query cannot slip by.
const norm = (q) => q.replace(/\s+/g, ' ').trim();

function createTeamsFake() {
    const s = {
        users: { 1: 'Captain', 2: 'Ali', 3: 'Vali', 4: 'Dilnoza' },
        emails: { 1: 'captain@x.uz', 2: 'ali@x.uz', 3: 'vali@x.uz', 4: 'dilnoza@x.uz' },
        blocked: {},
        teams: [], members: [], messages: [], id: 1, mid: 1, memberId: 1
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
            const t = { id: s.id++, name: p[0], description: p[1], direction: p[2], sphere: p[3], goals: p[4], captain_id: p[5], invite_mode: 'admin', topics_done: 0, achievements: 0, created_at: '2026-11-13T09:00:00.000Z' };
            s.teams.push(t);
            return [{ insertId: t.id }];
        }
        if (q.startsWith('SELECT id, name, captain_id, invite_mode FROM teams WHERE id = ?')) return [s.teams.filter((t) => t.id === p[0])];
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
