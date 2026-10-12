CREATE TABLE IF NOT EXISTS feed_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id TEXT NOT NULL,
  score REAL NOT NULL,
  features_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL CHECK (state IN ('queued', 'shown', 'opened', 'skipped', 'rejected', 'added')),
  source TEXT NOT NULL,
  rank INTEGER NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  shown_at TEXT,
  UNIQUE (user_id, media_type, tmdb_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (media_type, tmdb_id)
    REFERENCES media(media_type, tmdb_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feed_items_user_state_rank
  ON feed_items(user_id, state, rank, created_at);
