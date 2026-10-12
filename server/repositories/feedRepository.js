import { db } from "../db/database.js";
import { normalizeMediaRef } from "../utils/mediaIdentity.js";

const STATES = new Set(["queued", "shown", "opened", "skipped", "rejected", "added"]);

function requireUserId(userId) {
  if (!Number.isInteger(userId) || userId < 1) throw new TypeError("A valid user id is required.");
}

function rowToItem(row) {
  let features = {};
  try { features = JSON.parse(row.features_json || "{}"); } catch { features = {}; }
  return {
    id: row.id,
    type: row.media_type,
    tmdbId: row.tmdb_id,
    title: row.title,
    posterPath: row.poster_path,
    score: row.score,
    features,
    state: row.state,
    source: row.source,
    rank: row.rank,
    generation: row.generation,
    createdAt: row.created_at,
    shownAt: row.shown_at,
  };
}

const ITEM_SELECT = `
  SELECT f.*, m.title, m.poster_path
  FROM feed_items f
  JOIN media m ON m.media_type = f.media_type AND m.tmdb_id = f.tmdb_id
`;

export function listQueuedFeedItems(userId, limit = 20) {
  requireUserId(userId);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return db.prepare(`${ITEM_SELECT}
    WHERE f.user_id = ? AND f.state = 'queued'
    ORDER BY f.rank, f.created_at, f.id
    LIMIT ?`).all(userId, safeLimit).map(rowToItem);
}

export function markFeedItemsShown(userId, itemIds) {
  requireUserId(userId);
  if (!itemIds.length) return;
  const timestamp = new Date().toISOString();
  const update = db.prepare(`
    UPDATE feed_items SET state = 'shown', shown_at = COALESCE(shown_at, ?)
    WHERE user_id = ? AND id = ? AND state = 'queued'
  `);
  db.exec("BEGIN");
  try {
    for (const id of itemIds) update.run(timestamp, userId, Number(id));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function countAvailableFeedItems(userId) {
  requireUserId(userId);
  return db.prepare(`
    SELECT COUNT(*) AS count FROM feed_items
    WHERE user_id = ? AND state IN ('queued', 'shown')
  `).get(userId).count;
}

export function enqueueFeedItems(userId, items) {
  requireUserId(userId);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO feed_items
      (user_id, media_type, tmdb_id, score, features_json, state, source, rank, generation, created_at)
    VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)
  `);
  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const item of items) {
      const ref = normalizeMediaRef(item.type, item.id);
      if (!Number.isFinite(item.score)) throw new TypeError("Feed score must be finite.");
      const result = insert.run(
        userId, ref.type, ref.id, item.score, JSON.stringify(item.features || {}),
        String(item.source || "unknown"), Number(item.rank) || 0,
        Number(item.generation) || 1, new Date().toISOString(),
      );
      inserted += result.changes;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return inserted;
}

export function transitionFeedItem(userId, itemId, state) {
  requireUserId(userId);
  if (!STATES.has(state)) throw new TypeError("Invalid feed item state.");
  const result = db.prepare(`
    UPDATE feed_items SET state = ?
    WHERE user_id = ? AND id = ? AND state IN ('queued', 'shown')
  `).run(state, userId, Number(itemId));
  return result.changes === 1;
}

export { STATES };
