-- Questions written by the admin for a tournament stage (slot r1, r2... for group rounds; quarter, semi, final for the playoffs)
CREATE TABLE IF NOT EXISTS tournament_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id INT NOT NULL,
    slot VARCHAR(10) NOT NULL,
    position TINYINT UNSIGNED NOT NULL,
    question VARCHAR(400) NOT NULL,
    options TEXT NOT NULL,
    correct TINYINT UNSIGNED NOT NULL,
    explanation VARCHAR(300) NULL,
    INDEX idx_tq_slot (tournament_id, slot, position),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);
