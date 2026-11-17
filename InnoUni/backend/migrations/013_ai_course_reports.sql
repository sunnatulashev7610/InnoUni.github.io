CREATE TABLE IF NOT EXISTS ai_course_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    lesson_id INT NULL,
    reporter_id INT NOT NULL,
    message VARCHAR(500) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_reports_course (course_id, status),
    INDEX idx_ai_reports_reporter (reporter_id, created_at)
);
