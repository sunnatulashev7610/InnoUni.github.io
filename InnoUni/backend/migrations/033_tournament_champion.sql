-- The champion of a seasonal tournament is saved once (and everybody is told once); the Hall of Fame reads it
ALTER TABLE tournaments ADD COLUMN champion_team_id INT NULL, ADD COLUMN finished_at DATETIME NULL;
