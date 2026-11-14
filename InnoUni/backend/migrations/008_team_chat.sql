CREATE TABLE IF NOT EXISTS team_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id INT NOT NULL,
    user_id INT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    INDEX idx_team_messages (team_id, id),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
ALTER TABLE team_members ADD COLUMN muted_until TIMESTAMP NULL;
ALTER TABLE team_members ADD COLUMN invited_by INT NULL;
ALTER TABLE teams ADD COLUMN invite_mode VARCHAR(10) NOT NULL DEFAULT 'admin';
