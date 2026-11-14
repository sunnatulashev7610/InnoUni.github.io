// Small lookups shared by the team and chat routes. The "muted" flag is worked out by the database clock
// (NOW()), so a restriction ends on time whatever the time zones of the server and the database are.

async function getTeam(db, teamId) {
    const [rows] = await db.execute('SELECT id, name, captain_id, invite_mode FROM teams WHERE id = ?', [teamId]);
    return rows[0] || null;
}

// The person's membership row (active member, join request or invitation), or null
async function getMember(db, teamId, userId) {
    const [rows] = await db.execute(
        'SELECT status, anonymous, invited_by, ' +
        '(muted_until IS NOT NULL AND muted_until > NOW()) AS muted, ' +
        'IFNULL(GREATEST(TIMESTAMPDIFF(SECOND, NOW(), muted_until), 0), 0) AS muted_seconds ' +
        'FROM team_members WHERE team_id = ? AND user_id = ?',
        [teamId, userId]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
        status: r.status,
        anonymous: Boolean(Number(r.anonymous)),
        invited: r.invited_by !== null && r.invited_by !== undefined,
        muted: Boolean(Number(r.muted)),
        muted_seconds: Number(r.muted_seconds) || 0
    };
}

async function countActive(db, teamId) {
    const [rows] = await db.execute("SELECT COUNT(*) AS n FROM team_members WHERE team_id = ? AND status = 'active'", [teamId]);
    return Number(rows[0].n);
}

module.exports = { getTeam, getMember, countActive };
