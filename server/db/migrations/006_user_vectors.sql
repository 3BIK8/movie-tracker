CREATE TABLE IF NOT EXISTS user_vectors (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('long', 'session')),
  model TEXT NOT NULL,
  dim INTEGER NOT NULL CHECK (dim > 0),
  vector BLOB NOT NULL,
  n_updates INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, model),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
