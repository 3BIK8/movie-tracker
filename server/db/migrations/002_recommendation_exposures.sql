CREATE TABLE IF NOT EXISTS recommendation_exposures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  shown_at TEXT NOT NULL,
  UNIQUE (user_id, media_type, tmdb_id, generation_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recommendation_exposures_user_media_shown
  ON recommendation_exposures(user_id, media_type, shown_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_exposures_user_shown
  ON recommendation_exposures(user_id, shown_at DESC);
