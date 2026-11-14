// Course progress is calculated by the server from real work, never set by the student:
// the share of the course's tasks (course-wide ones and ones assigned to this student) that the student has submitted.
async function recomputeProgress(db, courseId, userId) {
    const [[row]] = await db.execute(
        `SELECT
            (SELECT COUNT(*) FROM tasks t WHERE t.course_id = ? AND (t.assigned_to IS NULL OR t.assigned_to = ?)) AS total,
            (SELECT COUNT(DISTINCT s.task_id) FROM task_submissions s JOIN tasks t ON t.id = s.task_id
              WHERE t.course_id = ? AND (t.assigned_to IS NULL OR t.assigned_to = ?) AND s.student_id = ?) AS done`,
        [courseId, userId, courseId, userId, userId]
    );
    const total = Number(row.total) || 0;
    const done = Number(row.done) || 0;
    const progress = total > 0 ? Math.round((done * 10000) / total) / 100 : 0;
    await db.execute(
        "UPDATE course_enrollments SET progress = ?, status = ? WHERE course_id = ? AND user_id = ? AND status IN ('active', 'completed')",
        [progress, total > 0 && done >= total ? 'completed' : 'active', courseId, userId]
    );
    return progress;
}

module.exports = { recomputeProgress };
