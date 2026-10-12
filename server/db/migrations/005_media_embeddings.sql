ALTER TABLE media ADD COLUMN metadata_fetched_at TEXT;
ALTER TABLE media ADD COLUMN metadata_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS media_embeddings (
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id TEXT NOT NULL,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL CHECK (dim > 0),
  vector BLOB NOT NULL,
  text_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (media_type, tmdb_id, model),
  FOREIGN KEY (media_type, tmdb_id)
    REFERENCES media(media_type, tmdb_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_embeddings_hash
  ON media_embeddings(model, text_hash);
