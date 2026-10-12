import { db } from "../db/database.js";

const VALID_TYPES = new Set(["movie", "tv"]);
const VALID_STATUSES = new Set(["watched", "to_watch", "not_sure"]);
const VALID_RATINGS = new Set(["S", "A", "B", "C", "D"]);

function normalizeType(value) {
  const type = String(value || "").trim().toLowerCase();
  return VALID_TYPES.has(type) ? type : null;
}

function normalizeId(value) {
  const id = String(value ?? "").trim();
  const normalized = /^\d+$/.test(id) ? id.replace(/^0+/, "") : "";
  return normalized && normalized !== "0" ? normalized : null;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToHistoryItem(row) {
  return {
    type: row.media_type,
    id: row.tmdb_id,
    title: row.title || "",
    date: row.date || null,
    year: row.year ?? null,
    poster_path: row.poster_path || null,
    genres: normalizeArray(parseJson(row.metadata_json, {}).genres),
    genre_ids: normalizeArray(parseJson(row.genre_ids_json, [])),
    actors: normalizeArray(parseJson(row.metadata_json, {}).actors),
    directors: normalizeArray(parseJson(row.metadata_json, {}).directors),
    studios: normalizeArray(parseJson(row.metadata_json, {}).studios),
    keywords: normalizeArray(parseJson(row.metadata_json, {}).keywords),
    language: parseJson(row.metadata_json, {}).language ?? null,
    popularity: parseJson(row.metadata_json, {}).popularity ?? null,
    tmdbRating: parseJson(row.metadata_json, {}).tmdbRating ?? null,
    franchise: parseJson(row.metadata_json, {}).franchise ?? null,
    status: row.status || null,
    rating: row.rating || null,
    favorite: row.favorite === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statusChangedAt: row.status_changed_at || null,
    ratingUpdatedAt: row.rating_updated_at || null,
    favoriteAt: row.favorite_at || null,
    lastInteractedAt: row.last_interacted_at || null,
  };
}

function normalizeHistoryItem(item) {
  const type = normalizeType(item?.type);
  const id = normalizeId(item?.id);

  if (!type || !id) {
    throw new Error("Watch history item requires a valid movie/tv type and TMDB id.");
  }

  const status = item.status == null ? null : String(item.status);
  const rating = item.rating == null ? null : String(item.rating);

  if (status !== null && !VALID_STATUSES.has(status)) {
    throw new Error(`Invalid watch status: ${status}`);
  }

  if (rating !== null && !VALID_RATINGS.has(rating)) {
    throw new Error(`Invalid watch rating: ${rating}`);
  }

  const metadata = {
    genres: normalizeArray(item.genres),
    actors: normalizeArray(item.actors),
    directors: normalizeArray(item.directors),
    studios: normalizeArray(item.studios),
    keywords: normalizeArray(item.keywords),
    language: item.language ?? null,
    popularity: typeof item.popularity === "number" ? item.popularity : null,
    tmdbRating: typeof item.tmdbRating === "number" ? item.tmdbRating : null,
    franchise: item.franchise ?? null,
  };

  return {
    type,
    id,
    title: item.title || item.name || "",
    date: item.date || null,
    year: Number.isInteger(item.year) ? item.year : null,
    posterPath: item.poster_path ?? null,
    genreIds: normalizeArray(item.genre_ids),
    metadata,
    status,
    rating,
    favorite: item.favorite === true,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    statusChangedAt: item.statusChangedAt || null,
    ratingUpdatedAt: item.ratingUpdatedAt || null,
    favoriteAt: item.favoriteAt || null,
    lastInteractedAt: item.lastInteractedAt || item.updatedAt || null,
  };
}

const SELECT_SQL = `
  SELECT
    w.user_id,
    w.media_type,
    w.tmdb_id,
    w.status,
    w.rating,
    w.favorite,
    w.created_at,
    w.updated_at,
    w.status_changed_at,
    w.rating_updated_at,
    w.favorite_at,
    w.last_interacted_at,
    m.title,
    m.date,
    m.year,
    m.poster_path,
    m.genre_ids_json,
    m.metadata_json
  FROM watch_entries w
  JOIN media m
    ON m.media_type = w.media_type
   AND m.tmdb_id = w.tmdb_id
  WHERE w.user_id = ?
`;

export function getWatchHistory(userId = 1) {
  const rows = db
    .prepare(`${SELECT_SQL} ORDER BY w.last_interacted_at DESC, w.media_type, w.tmdb_id`)
    .all(userId);

  return rows.map(rowToHistoryItem);
}

export function getWatchHistoryCount(userId = 1) {
  return db
    .prepare("SELECT COUNT(*) AS count FROM watch_entries WHERE user_id = ?")
    .get(userId).count;
}

export function getCachedMediaMetadata(type, id) {
  const normalizedType = normalizeType(type);
  const normalizedId = normalizeId(id);

  if (!normalizedType || !normalizedId) {
    return null;
  }

  const row = db.prepare(`
    SELECT media_type, tmdb_id, title, date, year, poster_path, metadata_json
    FROM media
    WHERE media_type = ? AND tmdb_id = ?
  `).get(normalizedType, normalizedId);

  if (!row) {
    return null;
  }

  const metadata = parseJson(row.metadata_json, {});
  const hasConnections = [
    metadata.actors,
    metadata.directors,
    metadata.genres,
    metadata.keywords,
    metadata.studios,
  ].some((value) => Array.isArray(value) && value.length > 0);

  if (!hasConnections) {
    return null;
  }

  return {
    id: row.tmdb_id,
    type: row.media_type,
    title: row.title,
    year: row.year,
    overview: metadata.overview || "",
    poster_path: row.poster_path,
    backdrop_path: metadata.backdrop_path || null,
    actors: normalizeArray(metadata.actors),
    directors: normalizeArray(metadata.directors),
    genres: normalizeArray(metadata.genres),
    keywords: normalizeArray(metadata.keywords),
    franchises: metadata.franchise ? [metadata.franchise] : normalizeArray(metadata.franchises),
    studios: normalizeArray(metadata.studios),
    language: metadata.language || null,
    rating: metadata.tmdbRating ?? null,
    voteCount: metadata.voteCount ?? null,
    popularity: metadata.popularity ?? null,
  };
}

export function upsertWatchHistoryItem(rawItem, userId = 1) {
  const item = normalizeHistoryItem(rawItem);
  const now = new Date().toISOString();

  const write = db.prepare(`
    INSERT INTO media (
      media_type, tmdb_id, title, date, year, poster_path,
      genre_ids_json, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(media_type, tmdb_id) DO UPDATE SET
      title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE media.title END,
      date = COALESCE(excluded.date, media.date),
      year = COALESCE(excluded.year, media.year),
      poster_path = COALESCE(excluded.poster_path, media.poster_path),
      genre_ids_json = CASE
        WHEN excluded.genre_ids_json <> '[]' THEN excluded.genre_ids_json
        ELSE media.genre_ids_json
      END,
      metadata_json = CASE
        WHEN excluded.metadata_json <> '{}' THEN excluded.metadata_json
        ELSE media.metadata_json
      END,
      updated_at = excluded.updated_at
  `);

  const entry = db.prepare(`
    INSERT INTO watch_entries (
      user_id, media_type, tmdb_id, status, rating, favorite,
      created_at, updated_at, status_changed_at, rating_updated_at,
      favorite_at, last_interacted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, media_type, tmdb_id) DO UPDATE SET
      status = excluded.status,
      rating = excluded.rating,
      favorite = excluded.favorite,
      updated_at = excluded.updated_at,
      status_changed_at = excluded.status_changed_at,
      rating_updated_at = excluded.rating_updated_at,
      favorite_at = excluded.favorite_at,
      last_interacted_at = excluded.last_interacted_at
  `);

  db.exec("BEGIN");
  try {
    write.run(
      item.type,
      item.id,
      item.title,
      item.date,
      item.year,
      item.posterPath,
      JSON.stringify(item.genreIds),
      JSON.stringify(item.metadata),
      item.createdAt,
      now,
    );

    entry.run(
      userId,
      item.type,
      item.id,
      item.status,
      item.rating,
      item.favorite ? 1 : 0,
      item.createdAt,
      now,
      item.statusChangedAt,
      item.ratingUpdatedAt,
      item.favoriteAt,
      item.lastInteractedAt || now,
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  if (item.status === null && !item.favorite) {
    deleteWatchHistoryItem(item.type, item.id, userId);
    return null;
  }

  return getWatchHistory(userId).find(
    (historyItem) => historyItem.type === item.type && historyItem.id === item.id,
  );
}

export function deleteWatchHistoryItem(type, id, userId = 1) {
  const normalizedType = normalizeType(type);
  const normalizedId = normalizeId(id);

  if (!normalizedType || !normalizedId) {
    throw new Error("Invalid watch history media identity.");
  }

  db.prepare(`
    DELETE FROM watch_entries
    WHERE user_id = ? AND media_type = ? AND tmdb_id = ?
  `).run(userId, normalizedType, normalizedId);

  db.prepare(`
    DELETE FROM media
    WHERE media_type = ?
      AND tmdb_id = ?
      AND NOT EXISTS (
        SELECT 1
        FROM watch_entries
        WHERE media_type = ? AND tmdb_id = ?
      )
  `).run(normalizedType, normalizedId, normalizedType, normalizedId);
}

export function migrateLegacyWatchHistory(history, userId = 1) {
  if (!history || typeof history !== "object" || Array.isArray(history)) {
    throw new Error("Legacy watch history must be an object.");
  }

  const items = Object.values(history).filter(
    (item) => item && typeof item === "object",
  );

  db.exec("BEGIN");
  try {
    for (const item of items) {
      const normalized = normalizeHistoryItem(item);

      db.prepare(`
        INSERT INTO media (
          media_type, tmdb_id, title, date, year, poster_path,
          genre_ids_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(media_type, tmdb_id) DO UPDATE SET
          title = excluded.title,
          date = excluded.date,
          year = excluded.year,
          poster_path = excluded.poster_path,
          genre_ids_json = excluded.genre_ids_json,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `).run(
        normalized.type,
        normalized.id,
        normalized.title,
        normalized.date,
        normalized.year,
        normalized.posterPath,
        JSON.stringify(normalized.genreIds),
        JSON.stringify(normalized.metadata),
        normalized.createdAt,
        normalized.updatedAt,
      );

      db.prepare(`
        INSERT INTO watch_entries (
          user_id, media_type, tmdb_id, status, rating, favorite,
          created_at, updated_at, status_changed_at, rating_updated_at,
          favorite_at, last_interacted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, media_type, tmdb_id) DO UPDATE SET
          status = excluded.status,
          rating = excluded.rating,
          favorite = excluded.favorite,
          updated_at = excluded.updated_at,
          status_changed_at = excluded.status_changed_at,
          rating_updated_at = excluded.rating_updated_at,
          favorite_at = excluded.favorite_at,
          last_interacted_at = excluded.last_interacted_at
      `).run(
        userId,
        normalized.type,
        normalized.id,
        normalized.status,
        normalized.rating,
        normalized.favorite ? 1 : 0,
        normalized.createdAt,
        normalized.updatedAt,
        normalized.statusChangedAt,
        normalized.ratingUpdatedAt,
        normalized.favoriteAt,
        normalized.lastInteractedAt,
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { migrated: true, count: getWatchHistoryCount(userId) };
}
