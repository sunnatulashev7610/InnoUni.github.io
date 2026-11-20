CREATE TABLE IF NOT EXISTS item_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    item_id INT NOT NULL,
    user_id INT NOT NULL,
    body VARCHAR(500) NOT NULL,
    answer TEXT NULL,
    answered_by INT NULL,
    answered_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_item_questions_item (item_id, id),
    INDEX idx_item_questions_user (user_id, course_id),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES course_content(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
