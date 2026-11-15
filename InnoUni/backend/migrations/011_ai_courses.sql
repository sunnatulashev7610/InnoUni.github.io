ALTER TABLE courses ADD COLUMN is_ai TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE courses ADD COLUMN creator_id INT NULL;

ALTER TABLE courses ADD COLUMN ai_provider VARCHAR(20) NULL;

ALTER TABLE course_content MODIFY COLUMN kind ENUM('video','guide','lesson') NOT NULL;

ALTER TABLE course_content MODIFY COLUMN url VARCHAR(500) NULL;

ALTER TABLE course_content ADD COLUMN body TEXT NULL;

CREATE TABLE IF NOT EXISTS ai_course_usage (
    user_id INT NOT NULL,
    day DATE NOT NULL,
    used INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
