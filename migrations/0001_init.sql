-- Account data only. Notes, tasks, calendar data and images are never stored here.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  picture_url TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE grants (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  scopes TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  -- Set when Google reports the refresh token revoked/expired. UI then shows "Reconnect Google".
  invalid_at INTEGER
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  device_label TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);
