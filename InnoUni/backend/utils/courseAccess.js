// Who a user is in a course: 'owner' (teacher or creator), 'student' (enrolled) or null
async function roleIn(db, courseId, userId) {
    const [c] = await db.execute('SELECT id, teacher_id, creator_id FROM courses WHERE id = ?', [courseId]);
    if (!c.length) return null;
    if (c[0].teacher_id === userId || c[0].creator_id === userId) return 'owner';
    const [e] = await db.execute("SELECT 1 AS ok FROM course_enrollments WHERE course_id = ? AND user_id = ? AND status IN ('active', 'completed')", [courseId, userId]);
    return e.length ? 'student' : null;
}
module.exports = { roleIn };
