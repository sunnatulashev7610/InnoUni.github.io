-- Seasonal tournaments run by the platform: registration, groups (everybody plays everybody), then playoffs
CREATE TABLE IF NOT EXISTS tournaments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    topic VARCHAR(200) NOT NULL,
    round_days TINYINT UNSIGNED NOT NULL DEFAULT 2,
    status VARCHAR(12) NOT NULL DEFAULT 'open',
    created_by INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournament_teams (
    tournament_id INT NOT NULL,
    team_id INT NOT NULL,
    registered_by INT NOT NULL,
    group_no TINYINT UNSIGNED NULL,
    seed_rating INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tournament_id, team_id),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tournament_matches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id INT NOT NULL,
    stage VARCHAR(10) NOT NULL,
    group_no TINYINT UNSIGNED NULL,
    round_no TINYINT UNSIGNED NOT NULL,
    team_a INT NOT NULL,
    team_b INT NOT NULL,
    battle_id INT NULL,
    INDEX idx_tm_tournament (tournament_id),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (team_a) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (team_b) REFERENCES teams(id) ON DELETE CASCADE
);
