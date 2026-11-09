const express = require('express');
const { authenticateToken, teacherOnly } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');

const router = express.Router();
router.use(authenticateToken);

const KINDS = ['course', 'material', 'tariff'];

// My orders
router.get('/mine', async (req, res) => {
    try {
        const [orders] = await req.db.execute(
            'SELECT id, kind, item_title, amount, note, status, created_at FROM orders WHERE user_id = ? ORDER BY id DESC', [req.user.userId]);
        res.json({ orders });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Place an order (always starts as pending)
router.post('/', async (req, res) => {
    const { kind } = req.body;
    if (!KINDS.includes(kind)) return res.status(400).json({ error: 'Invalid order kind' });
    const title = validateText(req.body.item_title, { field: 'Item', maxLength: 255 });
    if (title.error) return res.status(400).json({ error: title.error });
    const note = validateText(req.body.note, { field: 'Note', required: false, maxLength: 1000 });
    if (note.error) return res.status(400).json({ error: note.error });
    const amount = req.body.amount == null ? 0 : req.body.amount;
    if (!Number.isInteger(amount) || amount < 0) return res.status(400).json({ error: 'Amount must be a non-negative whole number' });
    try {
        const [r] = await req.db.execute(
            'INSERT INTO orders (user_id, kind, item_title, amount, note) VALUES (?, ?, ?, ?, ?)',
            [req.user.userId, kind, title.value, amount, note.value]);
        res.status(201).json({ id: r.insertId, status: 'pending' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Teacher side: all pending orders
router.get('/pending', teacherOnly, async (req, res) => {
    try {
        const [orders] = await req.db.execute(
            'SELECT o.id, o.kind, o.item_title, o.amount, o.note, o.created_at, u.full_name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.status = \'pending\' ORDER BY o.id');
        res.json({ orders });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Teacher confirms or rejects
router.post('/:id/decision', teacherOnly, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order id' });
    const { status } = req.body;
    if (!['confirmed', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status must be confirmed or rejected' });
    try {
        const [r] = await req.db.execute('UPDATE orders SET status = ? WHERE id = ? AND status = \'pending\'', [status, id]);
        if (!r.affectedRows) return res.status(404).json({ error: 'No pending order with this id' });
        res.json({ id, status });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
