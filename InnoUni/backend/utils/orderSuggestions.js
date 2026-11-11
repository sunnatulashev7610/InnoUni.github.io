// Finds existing courses and course materials that are close to what a student is asking for.
const STOP = new Set(['kerak', 'menga', 'uchun', 'bilan', 'haqida', 'bo\'yicha', 'istayman', 'xohlayman', 'kerakli',
    'kurs', 'kursi', 'kurslar', 'dars', 'darslar', 'darslik', 'darsliklar', 'material', 'materiallar', 'qo\'llanma', 'qo\'llanmalar',
    'video', 'videolar', 'o\'rganish', 'o\'rgatish', 'bor', 'yoki', 'ham', 'juda', 'yaxshi']);

const stemOf = (w) => (w.length >= 7 ? w.slice(0, 5) : w);
const STOP_STEMS = new Set([...STOP].map(stemOf));

// Words of 3+ letters, minus filler words, cut to a short stem so "darslikni" still finds "darslik"
function keywords(text) {
    const words = String(text || '').toLowerCase().replace(/[‘’`ʻʼ]/g, '\'').split(/[^\p{L}\p{N}']+/u).filter(Boolean);
    const out = [];
    for (const w of words) {
        if (w.length < 3 || /^\d+$/.test(w)) continue;
        const stem = stemOf(w);
        if (STOP.has(w) || STOP_STEMS.has(stem)) continue;
        if (!out.includes(stem)) out.push(stem);
        if (out.length >= 8) break;
    }
    return out;
}

const likeEscape = (s) => '%' + s.replace(/[\\%_]/g, '\\$&') + '%';
const score = (text, kws) => { const t = String(text || '').toLowerCase(); return kws.filter((k) => t.includes(k)).length; };

async function findSuggestions(db, userId, text) {
    const kws = keywords(text);
    if (!kws.length) return { courses: [], materials: [] };
    const like = kws.map(likeEscape);

    const cCond = kws.map(() => '(c.title LIKE ? OR c.description LIKE ? OR c.category LIKE ?)').join(' OR ');
    const [courseRows] = await db.execute(`
        SELECT c.id, c.title, c.description, c.category, u.full_name AS teacher, ce.id AS enrolled
        FROM courses c
        LEFT JOIN users u ON u.id = c.teacher_id
        LEFT JOIN course_enrollments ce ON ce.course_id = c.id AND ce.user_id = ? AND ce.status = 'active'
        WHERE c.status = 'active' AND (${cCond})
        LIMIT 50
    `, [userId].concat(...like.map((l) => [l, l, l])));

    const mCond = kws.map(() => 'cc.title LIKE ?').join(' OR ');
    const [matRows] = await db.execute(`
        SELECT cc.id, cc.kind, cc.title, cc.course_id, c.title AS course_title, ce.id AS enrolled
        FROM course_content cc
        JOIN courses c ON c.id = cc.course_id AND c.status = 'active'
        LEFT JOIN course_enrollments ce ON ce.course_id = c.id AND ce.user_id = ? AND ce.status = 'active'
        WHERE ${mCond}
        LIMIT 50
    `, [userId].concat(like));

    const courses = courseRows
        .map((c) => ({ id: c.id, title: c.title, category: c.category, teacher: c.teacher, enrolled: !!c.enrolled, score: score(c.title + ' ' + c.description + ' ' + c.category, kws) }))
        .filter((c) => c.score > 0).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 5);
    // Links are never sent here: they stay behind enrolment
    const materials = matRows
        .map((m) => ({ id: m.id, kind: m.kind, title: m.title, courseId: m.course_id, course: m.course_title, enrolled: !!m.enrolled, score: score(m.title, kws) }))
        .filter((m) => m.score > 0).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 5);
    return { courses, materials };
}

module.exports = { keywords, findSuggestions };
