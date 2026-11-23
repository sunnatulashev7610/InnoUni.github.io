-- Quiz battles: the questions (made once when the battle starts), each member's answers, and the final result per team.
CREATE TABLE IF NOT EXISTS battle_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    battle_id INT NOT NULL,
    position TINYINT NOT NULL,
    question VARCHAR(400) NOT NULL,
    options TEXT NOT NULL,
    correct TINYINT NOT NULL,
    explanation VARCHAR(300) NULL,
    UNIQUE KEY uq_battle_question_pos (battle_id, position),
    FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS battle_answers (
    question_id INT NOT NULL,
    user_id INT NOT NULL,
    battle_id INT NOT NULL,
    team_id INT NOT NULL,
    choice TINYINT NOT NULL,
    correct TINYINT(1) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (question_id, user_id),
    INDEX idx_battle_answers_battle (battle_id),
    FOREIGN KEY (question_id) REFERENCES battle_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS battle_results (
    battle_id INT NOT NULL,
    team_id INT NOT NULL,
    score DECIMAL(5,2) NOT NULL,
    correct_total INT NOT NULL,
    participants INT NOT NULL,
    place INT NOT NULL,
    PRIMARY KEY (battle_id, team_id),
    FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);
