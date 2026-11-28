-- "Baraban": a live game for a team. The platform admin writes question sets, the team admin starts a session,
-- the server draws a member and a question, and the member answers on their own phone.
CREATE TABLE IF NOT EXISTS wheel_sets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    questions MEDIUMTEXT NOT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wheel_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT NOT NULL,
    set_id INT NOT NULL,
    host_id INT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'open',
    current_user_id INT NULL,
    current_q INT NULL,
    asked_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    INDEX idx_wheel_team (team_id, status),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS wheel_turns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    user_id INT NOT NULL,
    q_index INT NOT NULL,
    choice TINYINT NULL,
    correct TINYINT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_wheel_turn (session_id, user_id),
    FOREIGN KEY (session_id) REFERENCES wheel_sessions(id) ON DELETE CASCADE
);
