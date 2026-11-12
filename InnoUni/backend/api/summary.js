// Real numbers for the dashboard: menu badges, home stats, results, teacher overview and student list.
// Everything is computed from the database; nothing here is a sample value.
const express = require('express');
const { authenticateToken, studentOnly, teacherOnly } = require('../middleware/roleBased');

const router = express.Router();
router.use(authenticateToken);
const fail = (res, e) => { console.error(e); res.status(500).json({ error: 'Server error' }); };
const num = (v) => (v === null || v === undefined ? null : Number(v));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Tasks the student can work on (assigned to them, or course tasks of an enrolled course) with their submission state
async function studentTasks(db, uid) {
    const [rows] = await db.execute(`
        SELECT t.id, DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date, s.status AS sub_status
        FROM tasks t
        LEFT JOIN course_enrollments ce ON ce.course_id = t.course_id AND ce.user_id = ? AND ce.status = 'active'
        LEFT JOIN task_submissions s ON s.task_id = t.id AND s.student_id = ?
        WHERE t.assigned_to = ? OR (t.assigned_to IS NULL AND ce.id IS NOT NULL)
        LIMIT 500
    `, [uid, uid, uid]);
    const today = iso(new Date());
    const soon = iso(addDays(new Date(), 7));
    const out = { todo: 0, overdue: 0, dueSoon: 0, submitted: 0, graded: 0 };
    for (const t of rows) {
        if (t.sub_status === 'graded') { out.graded++; continue; }
        if (t.sub_status === 'submitted') { out.submitted++; continue; }
        out.todo++;
        if (t.due_date && t.due_date < today) out.overdue++;
        else if (t.due_date && t.due_date <= soon) out.dueSoon++;
    }
    return out;
}

// Numbers for the sidebar badges and the header
router.get('/counts', async (req, res) => {
    try {
        const uid = req.user.userId; const db = req.db;
        if (req.user.role === 'student') {
            const t = await studentTasks(db, uid);
            const [g] = await db.execute('SELECT COUNT(*) AS n FROM group_members WHERE user_id = ?', [uid]);
            const [o] = await db.execute('SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status = \'offered\'', [uid]);
            return res.json({ role: 'student', groups: Number(g[0].n), tasksTodo: t.todo, ordersAnswered: Number(o[0].n) });
        }
        if (req.user.role === 'teacher') {
            const [r] = await db.execute('SELECT COUNT(*) AS n FROM task_submissions s JOIN tasks t ON t.id = s.task_id JOIN courses c ON c.id = t.course_id WHERE c.teacher_id = ? AND s.status = \'submitted\'', [uid]);
            const [o] = await db.execute('SELECT COUNT(*) AS n FROM orders o LEFT JOIN courses c ON c.id = o.course_id WHERE o.kind IN (\'course\', \'material\') AND o.status = \'pending\' AND (o.course_id IS NULL OR c.teacher_id = ?)', [uid]);
            const [g] = await db.execute('SELECT COUNT(*) AS n FROM group_members WHERE user_id = ?', [uid]);
            return res.json({ role: 'teacher', toGrade: Number(r[0].n), ordersPending: Number(o[0].n), groups: Number(g[0].n) });
        }
        res.json({ role: req.user.role });
    } catch (e) { fail(res, e); }
});

// Student: home stats and results
router.get('/student', studentOnly, async (req, res) => {
    try {
        const uid = req.user.userId; const db = req.db;
        const tasks = await studentTasks(db, uid);
        const [c] = await db.execute('SELECT COUNT(CASE WHEN status = \'active\' THEN 1 END) AS active, COUNT(CASE WHEN status = \'completed\' OR progress >= 100 THEN 1 END) AS done FROM course_enrollments WHERE user_id = ?', [uid]);
        const [g] = await db.execute('SELECT COUNT(*) AS n FROM group_members WHERE user_id = ?', [uid]);
        const [avg] = await db.execute('SELECT AVG(grade) AS avg FROM task_submissions WHERE student_id = ? AND status = \'graded\'', [uid]);
        const [courses] = await db.execute(`
            SELECT c.id, c.title, ce.progress, ce.status, u.full_name AS teacher
            FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id LEFT JOIN users u ON u.id = c.teacher_id
            WHERE ce.user_id = ? AND ce.status IN ('active', 'completed') ORDER BY ce.enrolled_at DESC LIMIT 20
        `, [uid]);
        const [grades] = await db.execute(`
            SELECT t.title AS task, c.title AS course, s.grade, s.graded_at
            FROM task_submissions s JOIN tasks t ON t.id = s.task_id JOIN courses c ON c.id = t.course_id
            WHERE s.student_id = ? AND s.status = 'graded' ORDER BY s.graded_at DESC LIMIT 8
        `, [uid]);
        res.json({
            activeCourses: Number(c[0].active), completedCourses: Number(c[0].done), groups: Number(g[0].n),
            tasks, avgGrade: avg[0].avg === null ? null : Math.round(Number(avg[0].avg) * 10) / 10,
            courses: courses.map((x) => ({ id: x.id, title: x.title, progress: Number(x.progress) || 0, completed: x.status === 'completed' || Number(x.progress) >= 100, teacher: x.teacher })),
            recentGrades: grades.map((x) => ({ task: x.task, course: x.course, grade: Number(x.grade), gradedAt: x.graded_at }))
        });
    } catch (e) { fail(res, e); }
});

// Teacher: overview, per-course numbers, last week and latest events
router.get('/teacher', teacherOnly, async (req, res) => {
    try {
        const uid = req.user.userId; const db = req.db;
        const [c] = await db.execute('SELECT COUNT(CASE WHEN status = \'active\' THEN 1 END) AS active, COUNT(CASE WHEN status <> \'active\' THEN 1 END) AS draft FROM courses WHERE teacher_id = ?', [uid]);
        const [st] = await db.execute('SELECT COUNT(DISTINCT ce.user_id) AS n FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id WHERE c.teacher_id = ? AND ce.status IN (\'active\', \'completed\')', [uid]);
        const [tk] = await db.execute('SELECT COUNT(*) AS n FROM tasks t JOIN courses c ON c.id = t.course_id WHERE c.teacher_id = ?', [uid]);
        const [sub] = await db.execute(`
            SELECT COUNT(CASE WHEN s.status = 'submitted' THEN 1 END) AS to_grade, COUNT(CASE WHEN s.status = 'graded' THEN 1 END) AS graded, AVG(CASE WHEN s.status = 'graded' THEN s.grade END) AS avg
            FROM task_submissions s JOIN tasks t ON t.id = s.task_id JOIN courses c ON c.id = t.course_id WHERE c.teacher_id = ?
        `, [uid]);
        const [courses] = await db.execute(`
            SELECT c.id, c.title, c.status,
                (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.status IN ('active', 'completed')) AS students,
                (SELECT COUNT(*) FROM tasks t WHERE t.course_id = c.id) AS tasks,
                (SELECT COUNT(*) FROM task_submissions s JOIN tasks t ON t.id = s.task_id WHERE t.course_id = c.id) AS submitted,
                (SELECT AVG(s.grade) FROM task_submissions s JOIN tasks t ON t.id = s.task_id WHERE t.course_id = c.id AND s.status = 'graded') AS avg_grade
            FROM courses c WHERE c.teacher_id = ? ORDER BY c.id DESC LIMIT 100
        `, [uid]);
        const [subDays] = await db.execute(`
            SELECT DATE_FORMAT(s.submitted_at, '%Y-%m-%d') AS d, COUNT(*) AS n
            FROM task_submissions s JOIN tasks t ON t.id = s.task_id JOIN courses c ON c.id = t.course_id
            WHERE c.teacher_id = ? AND s.submitted_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY DATE_FORMAT(s.submitted_at, '%Y-%m-%d')
        `, [uid]);
        const [enrDays] = await db.execute(`
            SELECT DATE_FORMAT(ce.enrolled_at, '%Y-%m-%d') AS d, COUNT(*) AS n
            FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id
            WHERE c.teacher_id = ? AND ce.enrolled_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY DATE_FORMAT(ce.enrolled_at, '%Y-%m-%d')
        `, [uid]);
        const [recentSub] = await db.execute(`
            SELECT s.submitted_at AS at, u.full_name AS who, t.title AS what
            FROM task_submissions s JOIN tasks t ON t.id = s.task_id JOIN courses c ON c.id = t.course_id JOIN users u ON u.id = s.student_id
            WHERE c.teacher_id = ? ORDER BY s.submitted_at DESC LIMIT 6
        `, [uid]);
        const [recentEnr] = await db.execute(`
            SELECT ce.enrolled_at AS at, u.full_name AS who, c.title AS what
            FROM course_enrollments ce JOIN courses c ON c.id = ce.course_id JOIN users u ON u.id = ce.user_id
            WHERE c.teacher_id = ? ORDER BY ce.enrolled_at DESC LIMIT 6
        `, [uid]);
        const [ord] = await db.execute('SELECT COUNT(*) AS n FROM orders o LEFT JOIN courses c ON c.id = o.course_id WHERE o.kind IN (\'course\', \'material\') AND o.status = \'pending\' AND (o.course_id IS NULL OR c.teacher_id = ?)', [uid]);

        const byDay = {};
        subDays.concat(enrDays).forEach((r) => { byDay[r.d] = (byDay[r.d] || 0) + Number(r.n); });
        const week = [];
        for (let i = 6; i >= 0; i--) { const d = addDays(new Date(), -i); week.push({ day: iso(d), count: byDay[iso(d)] || 0 }); }
        const recent = recentSub.map((r) => ({ type: 'submission', who: r.who, what: r.what, at: r.at }))
            .concat(recentEnr.map((r) => ({ type: 'enrolled', who: r.who, what: r.what, at: r.at })))
            .sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);
        res.json({
            activeCourses: Number(c[0].active), draftCourses: Number(c[0].draft), students: Number(st[0].n), tasksGiven: Number(tk[0].n),
            toGrade: Number(sub[0].to_grade), gradedCount: Number(sub[0].graded),
            avgGrade: sub[0].avg === null ? null : Math.round(Number(sub[0].avg) * 10) / 10,
            ordersPending: Number(ord[0].n),
            courses: courses.map((x) => ({ id: x.id, title: x.title, status: x.status, students: Number(x.students), tasks: Number(x.tasks), submitted: Number(x.submitted), avgGrade: x.avg_grade === null ? null : Math.round(Number(x.avg_grade) * 10) / 10 })),
            week, recent
        });
    } catch (e) { fail(res, e); }
});

// Teacher: everyone enrolled in my courses
router.get('/teacher/students', teacherOnly, async (req, res) => {
    try {
        const [rows] = await req.db.execute(`
            SELECT u.id, u.full_name, c.id AS course_id, c.title AS course, ce.progress, ce.enrolled_at,
                (SELECT MAX(s.submitted_at) FROM task_submissions s JOIN tasks t ON t.id = s.task_id WHERE t.course_id = c.id AND s.student_id = u.id) AS last_submission,
                (SELECT AVG(s.grade) FROM task_submissions s JOIN tasks t ON t.id = s.task_id WHERE t.course_id = c.id AND s.student_id = u.id AND s.status = 'graded') AS avg_grade
            FROM course_enrollments ce
            JOIN courses c ON c.id = ce.course_id AND c.teacher_id = ?
            JOIN users u ON u.id = ce.user_id
            WHERE ce.status IN ('active', 'completed')
            ORDER BY ce.enrolled_at DESC LIMIT 500
        `, [req.user.userId]);
        res.json({
            students: rows.map((r) => ({
                id: r.id, name: r.full_name, courseId: r.course_id, course: r.course, progress: Number(r.progress) || 0,
                lastActive: r.last_submission || r.enrolled_at, avgGrade: r.avg_grade === null ? null : Math.round(Number(r.avg_grade) * 10) / 10
            }))
        });
    } catch (e) { fail(res, e); }
});

module.exports = router;
