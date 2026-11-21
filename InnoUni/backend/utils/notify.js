// In-app notifications. Sending one must never break the action that caused it, so errors are only logged.
const KEEP_DAYS = 60;

async function notify(db, userId, { kind, title, body = null, page = null, refId = null }) {
    try {
        if (!userId || !kind || !title) return false;
        await db.execute(
            'INSERT INTO notifications (user_id, kind, title, body, page, ref_id) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, String(kind).slice(0, 30), String(title).slice(0, 120), body ? String(body).slice(0, 300) : null, page, refId]
        );
        await db.execute('DELETE FROM notifications WHERE user_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [userId, KEEP_DAYS]);
        return true;
    } catch (e) {
        if (process.env.NODE_ENV !== 'test') console.error('Notification failed:', e.message);
        return false;
    }
}
module.exports = { notify };
