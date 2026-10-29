-- =============================================================================
-- 001_init.sql — Initial schema (plan §22 Database Design)
-- Applied automatically by `npm run migrate` when DB_DRIVER=postgres.
-- The in-memory fallback driver does not use this file.
-- Kept as an explicit, reviewable artifact (not generated/fake).
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_input_mode text NOT NULL,
  preferred_output_mode text NOT NULL,
  primary_language text NOT NULL,
  secondary_language text,
  avatar_gender text,
  accessibility_settings jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL,
  host_user_id uuid NOT NULL REFERENCES users(id),
  max_participants int NOT NULL,
  created_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS session_participants (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL,
  joined_at timestamptz NOT NULL,
  left_at timestamptz,
  muted boolean NOT NULL DEFAULT false,
  camera_on boolean NOT NULL DEFAULT true,
  active_speaker boolean NOT NULL DEFAULT false,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  body text NOT NULL,
  sent_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS transcripts (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_user_id uuid NOT NULL,
  source text NOT NULL,
  text text NOT NULL,
  is_final boolean NOT NULL,
  confidence numeric, -- nullable: providers that do not report confidence store NULL, never a guessed 0
  language text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS translations (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source_transcript_id uuid NOT NULL,
  source_text text NOT NULL,
  target_representation text NOT NULL,
  confidence numeric NOT NULL,
  fallback_used boolean NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS gesture_events (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_user_id uuid NOT NULL,
  gesture_id text NOT NULL,
  label text NOT NULL,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS avatar_sequences (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  translation_id uuid REFERENCES translations(id),
  commands jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  session_id uuid REFERENCES sessions(id),
  category text NOT NULL,
  rating int NOT NULL,
  comment text,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS consents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  scope text NOT NULL,
  granted boolean NOT NULL,
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid,
  action text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participants_session ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_session ON transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_translations_session ON translations(session_id);
CREATE INDEX IF NOT EXISTS idx_gesture_events_session ON gesture_events(session_id);
