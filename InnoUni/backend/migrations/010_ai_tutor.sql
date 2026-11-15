CREATE TABLE IF NOT EXISTS ai_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    course_id INT NULL,
    role VARCHAR(10) NOT NULL,
    content TEXT NOT NULL,
    provider VARCHAR(20) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_messages_chat (user_id, course_id, id)
);
CREATE TABLE IF NOT EXISTS ai_usage (
    user_id INT NOT NULL,
    day DATE NOT NULL,
    used INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
