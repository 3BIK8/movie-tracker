import { db } from "../db/database.js";

const USER_ID = 1;
const MAX_EXPOSURES = 1000;
const EXPOSURE_LOOKBACK_DAYS = 90;

export function recordRecommendationExposures(recommendations, generationId) {
  if (!generationId || !Array.isArray(recommendations)) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO recommendation_exposures
      (user_id, media_type, tmdb_id, generation_id, shown_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const shownAt = new Date().toISOString();

  db.exec("BEGIN");
  try {
    for (const recommendation of recommendations) {
      if (!["movie", "tv"].includes(recommendation?.type)) continue;
      if (!/^\d+$/.test(String(recommendation?.id ?? ""))) continue;

      insert.run(
        USER_ID,
        recommendation.type,
        String(recommendation.id),
        generationId,
        shownAt,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  pruneRecommendationExposures();
}

export function getRecommendationExposures(mediaType = null) {
  const cutoff = new Date(
    Date.now() - EXPOSURE_LOOKBACK_DAYS * 86_400_000,
  ).toISOString();

  const rows = mediaType
    ? db.prepare(`
        SELECT media_type, tmdb_id, generation_id, shown_at
        FROM recommendation_exposures
        WHERE user_id = ? AND media_type = ? AND shown_at >= ?
        ORDER BY shown_at DESC
      `).all(USER_ID, mediaType, cutoff)
    : db.prepare(`
        SELECT media_type, tmdb_id, generation_id, shown_at
        FROM recommendation_exposures
        WHERE user_id = ? AND shown_at >= ?
        ORDER BY shown_at DESC
      `).all(USER_ID, cutoff);

  return rows.map((row) => ({
    type: row.media_type,
    id: row.tmdb_id,
    generationId: row.generation_id,
    exposedAt: row.shown_at,
    connections: [],
    interactions: [],
  }));
}

function pruneRecommendationExposures() {
  db.prepare(`
    DELETE FROM recommendation_exposures
    WHERE user_id = ?
      AND id NOT IN (
        SELECT id
        FROM recommendation_exposures
        WHERE user_id = ?
        ORDER BY shown_at DESC
        LIMIT ?
      )
  `).run(USER_ID, USER_ID, MAX_EXPOSURES);
}
