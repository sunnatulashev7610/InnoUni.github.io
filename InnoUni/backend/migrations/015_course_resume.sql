CREATE TABLE IF NOT EXISTS course_resume (
    user_id INT NOT NULL,
    course_id INT NOT NULL,
    item_id INT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES course_content(id) ON DELETE CASCADE
);
