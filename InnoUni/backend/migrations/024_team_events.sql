-- Team meetups: the admin plans them, members say "I'm going". Times are stored in UTC.
CREATE TABLE IF NOT EXISTS team_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT NOT NULL,
    user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    place VARCHAR(200) NULL,
    note VARCHAR(500) NULL,
    starts_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_team_events_team (team_id, starts_at),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_event_going (
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    team_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, user_id),
    INDEX idx_event_going_team (team_id),
    FOREIGN KEY (event_id) REFERENCES team_events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
