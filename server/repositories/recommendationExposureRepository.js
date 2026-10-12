import { db } from "../db/database.js";

const MAX_EXPOSURES = 1000;
const EXPOSURE_LOOKBACK_DAYS = 90;

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function ensureFeedbackStorage() {
  db.exec(`
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
  `);
}

function normalizeFeedback(feedback) {
  if (!feedback || !Array.isArray(feedback.exposures)) {
    return [];
  }

  return feedback.exposures
    .filter((exposure) =>
      ["movie", "tv"].includes(exposure?.type) &&
      /^\d+$/.test(String(exposure?.id ?? "")) &&
      String(exposure.id) !== "0",
    )
    .slice(-MAX_EXPOSURES)
    .map((exposure) => ({
      type: exposure.type,
      id: String(exposure.id).replace(/^0+/, ""),
      generationId: String(exposure.generationId || "legacy"),
      pool: exposure.pool || null,
      exposedAt: exposure.exposedAt || new Date().toISOString(),
      connections: Array.isArray(exposure.connections)
        ? exposure.connections.slice(0, 24)
        : [],
      interactions: Array.isArray(exposure.interactions)
        ? exposure.interactions.slice(-12)
        : [],
    }));
}

export function recordRecommendationFeedback(feedback, userId = 1) {
  const exposures = normalizeFeedback(feedback);
  if (!exposures.length) return;

  ensureFeedbackStorage();
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO recommendation_feedback (
      user_id, media_type, tmdb_id, generation_id, pool, exposed_at,
      connections_json, interactions_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, media_type, tmdb_id, generation_id) DO UPDATE SET
      pool = excluded.pool,
      exposed_at = excluded.exposed_at,
      connections_json = excluded.connections_json,
      interactions_json = excluded.interactions_json,
      updated_at = excluded.updated_at
  `);

  db.exec("BEGIN");
  try {
    for (const exposure of exposures) {
      upsert.run(
        userId,
        exposure.type,
        exposure.id,
        exposure.generationId,
        exposure.pool,
        exposure.exposedAt,
        JSON.stringify(exposure.connections),
        JSON.stringify(exposure.interactions),
        now,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  pruneRecommendationFeedback(userId);
}

export function getRecommendationFeedback(mediaType = null, userId = 1) {
  ensureFeedbackStorage();
  const cutoff = new Date(
    Date.now() - EXPOSURE_LOOKBACK_DAYS * 86_400_000,
  ).toISOString();
  const rows = mediaType
    ? db.prepare(`
        SELECT media_type, tmdb_id, generation_id, pool, exposed_at,
               connections_json, interactions_json
        FROM recommendation_feedback
        WHERE user_id = ? AND media_type = ? AND exposed_at >= ?
        ORDER BY exposed_at DESC
      `).all(userId, mediaType, cutoff)
    : db.prepare(`
        SELECT media_type, tmdb_id, generation_id, pool, exposed_at,
               connections_json, interactions_json
        FROM recommendation_feedback
        WHERE user_id = ? AND exposed_at >= ?
        ORDER BY exposed_at DESC
      `).all(userId, cutoff);

  return {
    exposures: rows.map((row) => ({
      type: row.media_type,
      id: row.tmdb_id,
      generationId: row.generation_id,
      pool: row.pool,
      exposedAt: row.exposed_at,
      connections: parseJson(row.connections_json, []),
      interactions: parseJson(row.interactions_json, []),
    })),
  };
}

function pruneRecommendationFeedback(userId) {
  db.prepare(`
    DELETE FROM recommendation_feedback
    WHERE user_id = ?
      AND rowid NOT IN (
        SELECT rowid
        FROM recommendation_feedback
        WHERE user_id = ?
        ORDER BY exposed_at DESC
        LIMIT ?
      )
  `).run(userId, userId, MAX_EXPOSURES);
}

export { MAX_EXPOSURES, EXPOSURE_LOOKBACK_DAYS };
