-- Meetup reminders: each reminder is sent once (24 hours before and 1 hour before)
ALTER TABLE team_events ADD COLUMN reminded_day TINYINT NOT NULL DEFAULT 0;
ALTER TABLE team_events ADD COLUMN reminded_hour TINYINT NOT NULL DEFAULT 0;
