// The bell in the header: my notifications, read marks, clearing.
const express = require('express');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId } = require('../utils/validation');

const router = express.Router();
router.use(authenticateToken);

const LIMIT = 30;

router.get('/', async (req, res) => {
    try {
        const uid = req.user.userId;
        const [rows] = await req.db.execute(
            `SELECT id, kind, title, body, page, ref_id, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ${LIMIT}`, [uid]);
        const [c] = await req.db.execute('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [uid]);
        res.json({
            unread: Number(c[0].n),
            items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, page: r.page, ref_id: r.ref_id, read: !!r.read_at, created_at: r.created_at }))
        });
    } catch (e) {
        console.error('Notifications read error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/read-all', async (req, res) => {
    try {
        await req.db.execute('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [req.user.userId]);
        res.json({ ok: true });
    } catch (e) {
        console.error('Notifications read-all error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/:id/read', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        const [r] = await req.db.execute('UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?', [id, req.user.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Notification not found' });
        res.json({ ok: true });
    } catch (e) {
        console.error('Notification read error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Clear all of mine
router.delete('/', async (req, res) => {
    try {
        await req.db.execute('DELETE FROM notifications WHERE user_id = ?', [req.user.userId]);
        res.json({ ok: true });
    } catch (e) {
        console.error('Notifications clear error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
