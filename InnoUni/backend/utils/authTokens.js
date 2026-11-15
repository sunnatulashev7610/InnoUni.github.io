// One-time tokens for e-mail verification and password reset.
// Only a SHA-256 hash is stored, so a database leak does not leak working links.
const crypto = require('crypto');

const hash = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

async function createToken(db, userId, kind, ttlMinutes) {
    const raw = crypto.randomBytes(32).toString('hex');
    await db.execute(
        'INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
        [userId, kind, hash(raw), ttlMinutes]
    );
    return raw;
}

// Uses the token once. Returns the user id, or null when it is unknown, used or expired.
async function consumeToken(db, raw, kind) {
    if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw)) return null;
    const [rows] = await db.execute(
        'SELECT id, user_id FROM auth_tokens WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > NOW()',
        [hash(raw), kind]
    );
    if (!rows.length) return null;
    const [r] = await db.execute('UPDATE auth_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL', [rows[0].id]);
    return r.affectedRows ? rows[0].user_id : null; // a parallel request that got there first wins
}

// True when a token of this kind was already sent to the user in the last `seconds` seconds
async function sentRecently(db, userId, kind, seconds) {
    const [rows] = await db.execute(
        'SELECT id FROM auth_tokens WHERE user_id = ? AND kind = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND) LIMIT 1',
        [userId, kind, seconds]
    );
    return rows.length > 0;
}

module.exports = { createToken, consumeToken, sentRecently, hash };
