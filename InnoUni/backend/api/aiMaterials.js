// AI material creator: the AI first asks a few general questions (what kind of material, which style, level, length),
// then prepares the material to those conditions. For now materials are private ("Mening materiallarim"); the library stays closed.
const express = require('express');
const { authenticateToken } = require('../middleware/roleBased');
const { parseId, validateText } = require('../utils/validation');
const { materialDraft } = require('../utils/aiProvider');

const router = express.Router();
router.use(authenticateToken);

const dailyLimit = () => Math.max(1, parseInt(process.env.AI_MATERIAL_DAILY_LIMIT, 10) || 5);
const busy = new Set();

// The clarifying questions: one source of truth, the page draws them from here
const QUESTIONS = [
    { key: 'kind', label: 'Qanday material kerak?', options: ['Konspekt', 'Qadamma-qadam qo\'llanma', 'Savol-javob (test)', 'Terminlar kartochkasi', 'Reja va jadval'] },
    { key: 'style', label: 'Qaysi uslubda yozilsin?', options: ['Oddiy va sodda', 'Misollar bilan', 'Rasmiy (akademik)', 'Qisqa tezislar'] },
    { key: 'level', label: 'Qaysi daraja uchun?', options: ['Boshlang\'ich', 'O\'rta', 'Yuqori'] },
    { key: 'length', label: 'Hajmi qancha bo\'lsin?', options: ['Qisqa (taxminan 1 bet)', 'O\'rta', 'Batafsil'] }
];
const defaults = Object.fromEntries(QUESTIONS.map((q) => [q.key, q.options[0]]));

async function usage(db, userId) {
    const [rows] = await db.execute('SELECT used FROM ai_material_usage WHERE user_id = ? AND day = CURDATE()', [userId]);
    const used = rows.length ? Number(rows[0].used) : 0;
    return { limit: dailyLimit(), used, remaining: Math.max(0, dailyLimit() - used) };
}

router.get('/options', async (req, res) => {
    try {
        res.json({ questions: QUESTIONS, extraLabel: 'Yana nimani hisobga olay? (ixtiyoriy)', ...(await usage(req.db, req.user.userId)) });
    } catch (e) {
        console.error('AI material options error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/', async (req, res) => {
    try {
        const [rows] = await req.db.execute('SELECT id, title, topic, kind, provider, created_at FROM ai_materials WHERE user_id = ? ORDER BY id DESC LIMIT 100', [req.user.userId]);
        res.json({ materials: rows.map((m) => ({ ...m, demo: m.provider === 'demo' })) });
    } catch (e) {
        console.error('AI materials list error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid material id' });
        const [rows] = await req.db.execute('SELECT id, title, topic, kind, body, provider, created_at FROM ai_materials WHERE id = ? AND user_id = ?', [id, req.user.userId]);
        if (!rows.length) return res.status(404).json({ error: 'Material not found' });
        res.json({ material: { ...rows[0], demo: rows[0].provider === 'demo' } });
    } catch (e) {
        console.error('AI material read error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// The answers must be one of the offered options (or empty: the first option is the default)
function readBrief(body) {
    const topic = validateText(body.topic, { field: 'Topic', maxLength: 200 });
    if (topic.error) return { error: topic.error };
    if (topic.value.length < 3) return { error: 'Topic is too short' };
    const brief = { topic: topic.value };
    for (const q of QUESTIONS) {
        const v = body[q.key] === undefined || body[q.key] === '' ? defaults[q.key] : body[q.key];
        if (!q.options.includes(v)) return { error: `Invalid answer for ${q.key}` };
        brief[q.key] = v;
    }
    const extra = validateText(body.extra, { field: 'Extra', required: false, maxLength: 300 });
    if (extra.error) return { error: extra.error };
    brief.extra = extra.value;
    return { brief };
}

router.post('/', async (req, res) => {
    const userId = req.user.userId;
    let locked = false;
    let reserved = false;
    try {
        const db = req.db;
        const parsed = readBrief(req.body || {});
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        if (busy.has(userId)) return res.status(429).json({ error: 'Wait for the previous material' });
        busy.add(userId); locked = true;

        await db.execute('INSERT IGNORE INTO ai_material_usage (user_id, day, used) VALUES (?, CURDATE(), 0)', [userId]);
        const [taken] = await db.execute('UPDATE ai_material_usage SET used = used + 1 WHERE user_id = ? AND day = CURDATE() AND used < ?', [userId, dailyLimit()]);
        if (!taken.affectedRows) return res.status(429).json({ error: 'Daily limit reached', ...(await usage(db, userId)) });
        reserved = true;

        const { material, provider } = await materialDraft(parsed.brief);
        const [ins] = await db.execute(
            'INSERT INTO ai_materials (user_id, title, topic, kind, body, provider) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, material.title, parsed.brief.topic, parsed.brief.kind, material.body, provider]
        );
        reserved = false;
        res.status(201).json({ materialId: ins.insertId, provider, ...(await usage(db, userId)) });
    } catch (e) {
        console.error('AI material create error:', e.message);
        if (reserved) await req.db.execute('UPDATE ai_material_usage SET used = used - 1 WHERE user_id = ? AND day = CURDATE() AND used > 0', [userId]).catch(() => {});
        res.status(502).json({ error: 'The AI could not make the material, try again in a minute' });
    } finally {
        if (locked) busy.delete(userId);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid material id' });
        const [r] = await req.db.execute('DELETE FROM ai_materials WHERE id = ? AND user_id = ?', [id, req.user.userId]);
        if (!r.affectedRows) return res.status(404).json({ error: 'Material not found' });
        res.json({ message: 'Material deleted' });
    } catch (e) {
        console.error('AI material delete error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
