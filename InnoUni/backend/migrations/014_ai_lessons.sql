CREATE TABLE IF NOT EXISTS lesson_progress (
    user_id INT NOT NULL,
    lesson_id INT NOT NULL,
    course_id INT NOT NULL,
    plan TEXT NULL,
    plan_provider VARCHAR(20) NULL,
    attempts INT NOT NULL DEFAULT 0,
    best_score TINYINT NULL,
    passed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, lesson_id),
    INDEX idx_lesson_progress_course (user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES course_content(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lesson_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    lesson_id INT NOT NULL,
    role VARCHAR(10) NOT NULL,
    content TEXT NOT NULL,
    provider VARCHAR(20) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_lesson_messages_chat (user_id, lesson_id, id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES course_content(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lesson_quizzes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    lesson_id INT NOT NULL,
    questions TEXT NOT NULL,
    provider VARCHAR(20) NULL,
    score TINYINT NULL,
    submitted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_lesson_quizzes (user_id, lesson_id, id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES course_content(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_lesson_usage (
    user_id INT NOT NULL,
    day DATE NOT NULL,
    used INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
