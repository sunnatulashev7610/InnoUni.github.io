-- Project battles: each playing team hands in one link; the platform judge gives each a score from 0 to 100
CREATE TABLE IF NOT EXISTS battle_submissions (
    battle_id INT NOT NULL,
    team_id INT NOT NULL,
    link VARCHAR(300) NOT NULL,
    note VARCHAR(500) NULL,
    submitted_by INT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (battle_id, team_id),
    FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS battle_scores (
    battle_id INT NOT NULL,
    team_id INT NOT NULL,
    score TINYINT UNSIGNED NOT NULL,
    comment VARCHAR(300) NULL,
    judge_id INT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (battle_id, team_id),
    FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);
