// Every course has exactly one group. The teacher is its leader; students join it when they enrol.
async function ensureCourseGroup(db, course) {
    await db.execute(
        'INSERT IGNORE INTO `groups` (name, description, created_by, course_id) VALUES (?, ?, ?, ?)',
        [course.title, course.description || null, course.teacher_id || null, course.id]
    );
    const [rows] = await db.execute('SELECT id FROM `groups` WHERE course_id = ?', [course.id]);
    const groupId = rows[0].id;
    if (course.teacher_id) {
        await db.execute("INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'leader')", [groupId, course.teacher_id]);
    }
    return groupId;
}

async function addToCourseGroup(db, course, userId) {
    const groupId = await ensureCourseGroup(db, course);
    await db.execute("INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, 'member')", [groupId, userId]);
    return groupId;
}

module.exports = { ensureCourseGroup, addToCourseGroup };
