-- A team can say it is not taking new people for now
ALTER TABLE teams ADD COLUMN recruiting TINYINT(1) NOT NULL DEFAULT 1;
-- Directions a person is interested in: the base for "teams for you"
CREATE TABLE IF NOT EXISTS user_interests (
    user_id INT NOT NULL,
    direction VARCHAR(30) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, direction),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
