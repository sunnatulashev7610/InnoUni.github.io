-- Team battles: one team challenges one or more teams. Statuses: invited, active, cancelled (finished comes with the results).
CREATE TABLE IF NOT EXISTS battles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    topic VARCHAR(200) NOT NULL,
    kind VARCHAR(10) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'invited',
    duration_days INT NOT NULL,
    host_team_id INT NOT NULL,
    created_by INT NOT NULL,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_battles_host (host_team_id),
    FOREIGN KEY (host_team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS battle_teams (
    battle_id INT NOT NULL,
    team_id INT NOT NULL,
    state VARCHAR(10) NOT NULL,
    responded_at TIMESTAMP NULL,
    PRIMARY KEY (battle_id, team_id),
    INDEX idx_battle_teams_team (team_id),
    FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);
