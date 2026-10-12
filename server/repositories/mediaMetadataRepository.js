import { db } from "../db/database.js";

const CACHE_TTL_DAYS = 30;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 86_400_000;

function normalizeType(type) {
  return type === "movie" || type === "tv" ? type : null;
}

function normalizeId(id) {
  return /^\d+$/.test(String(id ?? "")) ? String(id) : null;
}

function parseMetadata(row) {
  if (!row?.metadata_json) return null;

  try {
    const metadata = JSON.parse(row.metadata_json);
    return metadata && typeof metadata === "object" ? metadata : null;
  } catch {
    return null;
  }
}

export function getCachedMediaMetadata(type, id, now = Date.now()) {
  const mediaType = normalizeType(type);
  const tmdbId = normalizeId(id);
  if (!mediaType || !tmdbId) return null;

  const row = db.prepare(`
    SELECT metadata_json, updated_at
    FROM media
    WHERE media_type = ? AND tmdb_id = ?
  `).get(mediaType, tmdbId);

  if (!row) return null;

  const updatedAt = Date.parse(row.updated_at);
  if (!Number.isFinite(updatedAt) || now - updatedAt >= CACHE_TTL_MS) {
    return null;
  }

  return parseMetadata(row);
}

export function cacheMediaMetadata(metadata, now = new Date()) {
  const mediaType = normalizeType(metadata?.type);
  const tmdbId = normalizeId(metadata?.id);
  if (!mediaType || !tmdbId) return false;

  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  db.prepare(`
    INSERT INTO media (
      media_type,
      tmdb_id,
      title,
      date,
      year,
      poster_path,
      genre_ids_json,
      metadata_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(media_type, tmdb_id) DO UPDATE SET
      title = excluded.title,
      date = excluded.date,
      year = excluded.year,
      poster_path = excluded.poster_path,
      genre_ids_json = excluded.genre_ids_json,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).run(
    mediaType,
    tmdbId,
    metadata.title || "",
    metadata.year ? `${metadata.year}-01-01` : null,
    metadata.year ?? null,
    metadata.poster_path ?? null,
    JSON.stringify((metadata.genres || []).map((genre) => genre.id).filter(Boolean)),
    JSON.stringify(metadata),
    timestamp,
    timestamp,
  );

  return true;
}

export const MEDIA_METADATA_CACHE_POLICY = Object.freeze({
  ttlDays: CACHE_TTL_DAYS,
});
