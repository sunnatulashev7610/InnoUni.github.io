const express = require('express');
const { authenticateToken, teacherOnly, studentOnly } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');
const { findSuggestions } = require('../utils/orderSuggestions');

const router = express.Router();
router.use(authenticateToken);

const KINDS = ['course', 'material', 'tariff'];
const MAX_OPEN_ORDERS = 20;
const MAX_PRICE = 100000000;
const fail = (res, e) => { console.error(e); res.status(500).json({ error: 'Server error' }); };

// Course and material requests go to teachers; tariff orders go to the admin.
// The student is never told a price when ordering: the teacher decides it (or makes it free) after reading the request.

// My orders. The price is shown only once a teacher has set it.
router.get('/mine', async (req, res) => {
    try {
        const [rows] = await req.db.execute(
            'SELECT id, kind, item_title, note, status, price, reply, course_id, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 200', [req.user.userId]);
        res.json({
            orders: rows.map((o) => ({
                id: o.id, kind: o.kind, item_title: o.item_title, note: o.note, status: o.status, reply: o.reply || null,
                courseId: o.course_id, created_at: o.created_at,
                price: (o.status === 'offered' || o.status === 'confirmed') && o.price !== null && o.price !== undefined ? Number(o.price) : null
            }))
        });
    } catch (e) { fail(res, e); }
});

// Ready-made courses and materials close to what the student is asking for
router.get('/suggestions', async (req, res) => {
    const q = validateText(req.query.q, { field: 'Query', required: false, maxLength: 300 });
    if (q.error) return res.status(400).json({ error: q.error });
    try {
        res.json(await findSuggestions(req.db, req.user.userId, q.value));
    } catch (e) { fail(res, e); }
});

// Place an order. Always starts as pending; any price sent by the client is ignored.
router.post('/', async (req, res) => {
    const { kind } = req.body;
    if (!KINDS.includes(kind)) return res.status(400).json({ error: 'Invalid order kind' });
    if (kind !== 'tariff' && req.user.role !== 'student') return res.status(403).json({ error: 'Only students can request courses or materials' });
    if (req.user.role === 'admin') return res.status(403).json({ error: 'Admins cannot place orders' });
    const title = validateText(req.body.item_title, { field: 'Item', maxLength: 255 });
    if (title.error) return res.status(400).json({ error: title.error });
    const note = validateText(req.body.note, { field: 'Note', required: false, maxLength: 1000 });
    if (note.error) return res.status(400).json({ error: note.error });
    try {
        let courseId = null;
        if (req.body.course_id !== undefined && req.body.course_id !== null && req.body.course_id !== '') {
            courseId = parseId(req.body.course_id);
            if (!courseId || kind === 'tariff') return res.status(400).json({ error: 'Invalid course id' });
            const [c] = await req.db.execute('SELECT id FROM courses WHERE id = ? AND status = \'active\'', [courseId]);
            if (c.length === 0) return res.status(404).json({ error: 'Course not found' });
        }
        const [open] = await req.db.execute('SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status IN (\'pending\', \'offered\')', [req.user.userId]);
        if (Number(open[0].n) >= MAX_OPEN_ORDERS) return res.status(429).json({ error: 'Too many open orders. Wait for answers or cancel some.' });
        const [r] = await req.db.execute(
            'INSERT INTO orders (user_id, kind, item_title, note, course_id) VALUES (?, ?, ?, ?, ?)',
            [req.user.userId, kind, title.value, note.value, courseId]);
        res.status(201).json({ id: r.insertId, status: 'pending', sentTo: kind === 'tariff' ? 'admin' : 'teacher' });
    } catch (e) { fail(res, e); }
});

// Student accepts the teacher's offer (price or free)
router.post('/:id/accept', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order id' });
    try {
        const [r] = await req.db.execute('UPDATE orders SET status = \'confirmed\' WHERE id = ? AND user_id = ? AND status = \'offered\'', [id, req.user.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'No offer to accept for this order' });
        res.json({ id, status: 'confirmed' });
    } catch (e) { fail(res, e); }
});

// Student cancels an order that is still open
router.post('/:id/cancel', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order id' });
    try {
        const [r] = await req.db.execute('UPDATE orders SET status = \'cancelled\' WHERE id = ? AND user_id = ? AND status IN (\'pending\', \'offered\')', [id, req.user.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'No open order with this id' });
        res.json({ id, status: 'cancelled' });
    } catch (e) { fail(res, e); }
});

// Teacher side: requests for my courses, requests not tied to a course, and the ones I already answered.
router.get('/incoming', teacherOnly, async (req, res) => {
    try {
        const t = req.user.userId;
        const [rows] = await req.db.execute(`
            SELECT o.id, o.kind, o.item_title, o.note, o.status, o.price, o.reply, o.course_id, o.created_at,
                u.full_name AS student, c.title AS course_title
            FROM orders o
            JOIN users u ON u.id = o.user_id
            LEFT JOIN courses c ON c.id = o.course_id
            WHERE o.kind IN ('course', 'material')
              AND ((o.status = 'pending' AND (o.course_id IS NULL OR c.teacher_id = ?)) OR o.handled_by = ?)
            ORDER BY (o.status = 'pending') DESC, o.id DESC
            LIMIT 200
        `, [t, t]);
        res.json({ orders: rows.map((o) => ({ ...o, price: o.price === null || o.price === undefined ? null : Number(o.price) })) });
    } catch (e) { fail(res, e); }
});

// A pending request this teacher may answer (first answer wins; the UPDATE is the lock)
const ANSWERABLE = `id = ? AND status = 'pending' AND kind IN ('course', 'material')
    AND (course_id IS NULL OR course_id IN (SELECT id FROM courses WHERE teacher_id = ?))`;

// Set a price, or make it free
router.post('/:id/offer', teacherOnly, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order id' });
    let price;
    if (req.body.free === true) price = 0;
    else if (Number.isInteger(req.body.price) && req.body.price >= 0 && req.body.price <= MAX_PRICE) price = req.body.price;
    else return res.status(400).json({ error: 'Send a whole price from 0 to ' + MAX_PRICE + ', or free: true' });
    const reply = validateText(req.body.reply, { field: 'Reply', required: false, maxLength: 1000 });
    if (reply.error) return res.status(400).json({ error: reply.error });
    try {
        const [r] = await req.db.execute(
            `UPDATE orders SET status = 'offered', price = ?, reply = ?, handled_by = ? WHERE ${ANSWERABLE}`,
            [price, reply.value, req.user.userId, id, req.user.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'No pending request for you with this id' });
        res.json({ id, status: 'offered', price });
    } catch (e) { fail(res, e); }
});

// Decline the request
router.post('/:id/reject', teacherOnly, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order id' });
    const reply = validateText(req.body.reply, { field: 'Reply', required: false, maxLength: 1000 });
    if (reply.error) return res.status(400).json({ error: reply.error });
    try {
        const [r] = await req.db.execute(
            `UPDATE orders SET status = 'rejected', reply = ?, handled_by = ? WHERE ${ANSWERABLE}`,
            [reply.value, req.user.userId, id, req.user.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'No pending request for you with this id' });
        res.json({ id, status: 'rejected' });
    } catch (e) { fail(res, e); }
});

module.exports = router;
