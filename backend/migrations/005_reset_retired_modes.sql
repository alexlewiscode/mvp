-- MVP has no legacy users to preserve. Start its public run records from the
-- single current puzzle contract and discard the retired mode's run rows.
CREATE TABLE IF NOT EXISTS daily_code_attempts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_date date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, puzzle_date)
);

TRUNCATE TABLE game_runs;
TRUNCATE TABLE daily_code_attempts;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'game_runs'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE game_runs DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE game_runs
  ADD CONSTRAINT game_runs_game_id_check CHECK (game_id = 'daily_code'),
  ADD CONSTRAINT game_runs_raw_score_check CHECK (raw_score >= 0),
  ADD CONSTRAINT game_runs_normalized_score_check CHECK (normalized_score >= 0),
  ADD CONSTRAINT game_runs_duration_check CHECK (duration_ms >= 0),
  ADD CONSTRAINT game_runs_result_size_check CHECK (octet_length(result::text) <= 2048),
  ADD CONSTRAINT game_runs_challenge_contract_check CHECK (
    challenge_version = 1 AND challenge_id = game_id || ':v1:' || challenge_date::text
  );

DO $$
DECLARE index_name text;
BEGIN
  FOR index_name IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = current_schema() AND tablename = 'game_runs'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%challenge_date%'
  LOOP
    EXECUTE format('DROP INDEX %I', index_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS game_runs_one_daily_code_result
  ON game_runs(user_id, challenge_date);
