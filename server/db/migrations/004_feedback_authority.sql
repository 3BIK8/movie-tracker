CREATE TABLE IF NOT EXISTS rejections (
  user_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, media_type, tmdb_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rejections_user_created
  ON rejections(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS interaction_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'impression', 'dwell', 'expand', 'open', 'add',
      'rate', 'favorite', 'skip', 'reject', 'undo_reject'
    )
  ),
  value REAL,
  surface TEXT NOT NULL,
  feed_item_id TEXT,
  session_id TEXT,
  client_event_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interaction_events_user_client_id
  ON interaction_events(user_id, client_event_id);

CREATE INDEX IF NOT EXISTS idx_interaction_events_user_ts
  ON interaction_events(user_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_interaction_events_user_media_ts
  ON interaction_events(user_id, media_type, tmdb_id, ts DESC);
