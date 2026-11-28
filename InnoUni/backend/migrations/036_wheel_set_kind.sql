-- Question sets can now be of three kinds: quiz (4 options), tf (true/false statements), pairs (term + definition).
ALTER TABLE wheel_sets ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'quiz';
