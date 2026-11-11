ALTER TABLE `groups` ADD COLUMN course_id INT NULL;
ALTER TABLE `groups` ADD UNIQUE KEY uniq_group_course (course_id);
INSERT INTO `groups` (name, description, created_by, course_id) SELECT c.title, c.description, c.teacher_id, c.id FROM courses c;
INSERT INTO group_members (group_id, user_id, role) SELECT g.id, c.teacher_id, 'leader' FROM `groups` g JOIN courses c ON c.id = g.course_id WHERE c.teacher_id IS NOT NULL;
INSERT IGNORE INTO group_members (group_id, user_id, role) SELECT g.id, ce.user_id, 'member' FROM course_enrollments ce JOIN `groups` g ON g.course_id = ce.course_id WHERE ce.status = 'active'
