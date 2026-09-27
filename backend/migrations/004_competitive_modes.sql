ALTER TABLE users
  ADD COLUMN IF NOT EXISTS elo_rating integer NOT NULL DEFAULT 1000
    CHECK (elo_rating BETWEEN 100 AND 4000),
  ADD COLUMN IF NOT EXISTS match_points integer NOT NULL DEFAULT 0
    CHECK (match_points >= 0);

CREATE TABLE daily_code_puzzles (
  puzzle_id text PRIMARY KEY,
  title text NOT NULL,
  language text NOT NULL,
  snippet jsonb NOT NULL,
  buggy_line integer NOT NULL CHECK (buggy_line >= 0),
  answer text NOT NULL,
  explanation text NOT NULL,
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 3)
);

CREATE TABLE daily_code_attempts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_date date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, puzzle_date)
);

CREATE TABLE ranked_matches (
  id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('waiting', 'active', 'completed', 'expired')),
  puzzle_date date NOT NULL,
  puzzle_id text NOT NULL REFERENCES daily_code_puzzles(puzzle_id),
  player_one_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_two_id uuid REFERENCES users(id) ON DELETE CASCADE,
  player_one_rating integer NOT NULL,
  player_two_rating integer,
  player_one_duration_ms integer,
  player_two_duration_ms integer,
  player_one_attempts integer,
  player_two_attempts integer,
  player_one_submitted_at timestamptz,
  player_two_submitted_at timestamptz,
  winner_id uuid REFERENCES users(id),
  player_one_elo_delta integer,
  player_two_elo_delta integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK ((status = 'waiting' AND player_two_id IS NULL) OR status <> 'waiting'),
  CHECK (player_two_id IS NULL OR player_two_id <> player_one_id)
);
CREATE INDEX ranked_matches_waiting_idx ON ranked_matches(status, created_at)
  WHERE status = 'waiting';
CREATE INDEX ranked_matches_player_one_idx ON ranked_matches(player_one_id, created_at DESC);
CREATE INDEX ranked_matches_player_two_idx ON ranked_matches(player_two_id, created_at DESC);

CREATE TABLE company_profiles (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  email_domain text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX company_profiles_name_lower_unique ON company_profiles(lower(name));

CREATE TABLE company_memberships (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  verified_email text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_memberships_company_idx ON company_memberships(company_id);

CREATE TABLE company_verification_flows (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  company_name text NOT NULL,
  code_hash text NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_verification_flows_user_idx
  ON company_verification_flows(user_id, created_at DESC);

CREATE TABLE company_point_events (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id uuid NOT NULL UNIQUE REFERENCES ranked_matches(id) ON DELETE CASCADE,
  points integer NOT NULL CHECK (points > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_point_events_rolling_idx
  ON company_point_events(company_id, created_at DESC);

CREATE TABLE company_match_activity (
  company_id uuid NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES ranked_matches(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX company_match_activity_rolling_idx
  ON company_match_activity(company_id, created_at DESC);

-- The daily puzzle rotates deterministically through this server-side bank
-- using the UTC epoch day.
INSERT INTO daily_code_puzzles
  (puzzle_id, title, language, snippet, buggy_line, answer, explanation, difficulty)
VALUES
  ('daily-code-v1-01', 'Off-by-one loop', 'rust',
   '["fn count_items(items: Vec<i32>) -> i32 {", "    let mut count = 0;", "    for _ in 0..=items.len() {", "        count += 1;", "    }", "    count", "}"]'::jsonb,
   2, '    for _ in 0..items.len() {', 'The exclusive range stops before its end and iterates once per item.', 1),
  ('daily-code-v1-02', 'Too young to drive', 'rust',
   '["fn can_drive(age: u8) -> bool {", "    age < 18", "}"]'::jsonb,
   1, '    age >= 18', 'Driving eligibility begins at age 18.', 1),
  ('daily-code-v1-03', 'Adding the wrong number', 'rust',
   '["fn average(a: i32, b: i32) -> i32 {", "    (a + a) / 2", "}"]'::jsonb,
   1, '    (a + b) / 2', 'Both values must contribute to the average.', 1),
  ('daily-code-v1-04', 'A bill that does not add up', 'rust',
   '["fn split_bill(total: i32, people: i32) -> i32 {", "    total / people", "}"]'::jsonb,
   1, '    (total + people - 1) / people', 'Ceiling division ensures the full bill is covered.', 2),
  ('daily-code-v1-05', 'The last element is skipped', 'rust',
   '["fn sum_to(n: i32) -> i32 {", "    let mut total = 0;", "    for i in 1..n {", "        total += i;", "    }", "    total", "}"]'::jsonb,
   2, '    for i in 1..=n {', 'An inclusive range is required to include n.', 1)
ON CONFLICT (puzzle_id) DO NOTHING;
