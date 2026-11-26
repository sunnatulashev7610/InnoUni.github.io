-- A team captain can object to a finished battle result once; the platform admin answers
CREATE TABLE IF NOT EXISTS battle_appeals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    battle_id INT NOT NULL,
    team_id INT NOT NULL,
    user_id INT NOT NULL,
    reason VARCHAR(500) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'open',
    admin_note VARCHAR(300) NULL,
    resolved_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    UNIQUE KEY uq_appeal_once (battle_id, team_id),
    INDEX idx_appeals_status (status),
    FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
