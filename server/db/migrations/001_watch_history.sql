CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO users (id, created_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE IF NOT EXISTS media (
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  date TEXT,
  year INTEGER,
  poster_path TEXT,
  genre_ids_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (media_type, tmdb_id)
);

CREATE TABLE IF NOT EXISTS watch_entries (
  user_id INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  tmdb_id TEXT NOT NULL,
  status TEXT CHECK (status IS NULL OR status IN ('watched', 'to_watch', 'not_sure')),
  rating TEXT CHECK (rating IS NULL OR rating IN ('S', 'A', 'B', 'C', 'D')),
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status_changed_at TEXT,
  rating_updated_at TEXT,
  favorite_at TEXT,
  last_interacted_at TEXT,
  PRIMARY KEY (user_id, media_type, tmdb_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (media_type, tmdb_id)
    REFERENCES media(media_type, tmdb_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_watch_entries_user_status
  ON watch_entries(user_id, status);

CREATE INDEX IF NOT EXISTS idx_watch_entries_user_last_interacted
  ON watch_entries(user_id, last_interacted_at DESC);
