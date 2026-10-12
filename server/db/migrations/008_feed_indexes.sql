CREATE INDEX IF NOT EXISTS idx_feed_items_user_media
  ON feed_items(user_id, media_type, tmdb_id);
