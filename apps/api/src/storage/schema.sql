-- Transcribed exactly from PS5-CuePilot-Master-Report.md §12 "Storage schema".
--
-- Each event UUID routes to its own EventRoom Durable Object. Therefore these tables
-- hold ONE event and do not need an event_id column.
--
-- The shared QuotaRoom uses the `counters` table only.

CREATE TABLE IF NOT EXISTS event_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  revision INTEGER NOT NULL,
  published_revision INTEGER,
  state_json TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS revisions (
  revision INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  uid TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('owner','anchor')),
  joined_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invitations (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role = 'anchor'),
  expires_at TEXT NOT NULL,
  consumed_by TEXT,
  consumed_at TEXT
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('repair','script')),
  base_revision INTEGER NOT NULL,
  input_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','accepted','stale')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS command_results (
  uid TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (uid, request_key)
);

CREATE TABLE IF NOT EXISTS acknowledgments (
  uid TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  acknowledged_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  counter_key TEXT PRIMARY KEY,
  used INTEGER NOT NULL,
  reset_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proposals_expiry ON proposals(expires_at);
CREATE INDEX IF NOT EXISTS command_results_created ON command_results(created_at);
