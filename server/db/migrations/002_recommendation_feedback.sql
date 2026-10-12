CREATE TABLE IF NOT EXISTS recommendation_feedback (
  user_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  pool TEXT,
  exposed_at TEXT NOT NULL,
  connections_json TEXT NOT NULL DEFAULT '[]',
  interactions_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, media_type, tmdb_id, generation_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_user_exposed
  ON recommendation_feedback(user_id, exposed_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_user_media_exposed
  ON recommendation_feedback(user_id, media_type, exposed_at DESC);
