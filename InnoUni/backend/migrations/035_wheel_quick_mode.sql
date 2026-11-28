-- A second kind of live game: "Tezkor viktorina" (members answer in turn, every question once).
-- A member can now answer several times, so the one-turn-per-member rule becomes one-turn-per-question.
ALTER TABLE wheel_sessions ADD COLUMN mode VARCHAR(10) NOT NULL DEFAULT 'wheel';
ALTER TABLE wheel_turns ADD UNIQUE KEY uq_wheel_q (session_id, q_index), DROP INDEX uq_wheel_turn;
