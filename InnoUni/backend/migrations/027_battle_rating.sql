-- Battle rating per team (ELO style), kept apart from teams so no ALTER is needed
CREATE TABLE IF NOT EXISTS team_battle_stats (
    team_id INT NOT NULL PRIMARY KEY,
    rating INT NOT NULL DEFAULT 1000,
    played INT NOT NULL DEFAULT 0,
    wins INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);
