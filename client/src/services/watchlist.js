import {
  deleteWatchHistoryItem as deleteWatchHistoryItemFromDatabase,
  getMediaDetails,
  getWatchHistoryFromDatabase,
  migrateWatchHistoryToDatabase,
  saveWatchHistoryItem,
} from "./api";
import { recordRecommendationInteraction } from "./recommendationFeedback";

const STORAGE_KEY = "my-watch-history";

export const WATCH_HISTORY_UPDATED = "watch-history-updated";

let historyCache = {};
let initialized = false;
let initializationPromise = null;
const mutationQueues = new Map();

function normalizeMediaType(type) {
  return typeof type === "string" ? type.trim().toLowerCase() : "";
}

function normalizeMediaId(id) {
  const value = String(id ?? "").trim();
  return /^\d+$/.test(value) ? value.replace(/^0+/, "") || "0" : "";
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeArray(values) {
  return Array.isArray(values) ? values.filter(Boolean) : [];
}

function normalizeHistoryItem(item) {
  if (!item || typeof item !== "object") {
    return item;
  }

  return {
    ...item,
    type: normalizeMediaType(item.type),
    id: normalizeMediaId(item.id),
    genres: normalizeArray(item.genres),
    actors: normalizeArray(item.actors),
    directors: normalizeArray(item.directors),
    studios: normalizeArray(item.studios),
    keywords: normalizeArray(item.keywords),
    favorite: item.favorite === true,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    statusChangedAt: item.statusChangedAt || null,
    ratingUpdatedAt: item.ratingUpdatedAt || null,
    favoriteAt: item.favoriteAt || null,
    lastInteractedAt: item.lastInteractedAt || item.updatedAt || null,
  };
}

function normalizeHistory(history) {
  if (!history || typeof history !== "object") {
    return {};
  }

  const sourceItems = Array.isArray(history) ? history : Object.values(history);
  const normalized = {};

  for (const item of sourceItems) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const type = normalizeMediaType(item.type);
    const id = normalizeMediaId(item.id);

    if (!type || !id) {
      continue;
    }

    normalized[`${type}-${id}`] = normalizeHistoryItem({
      ...item,
      type,
      id,
    });
  }

  return normalized;
}

function readLegacyHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return normalizeHistory(parsed);
  } catch {
    return {};
  }
}

function clearLegacyHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The database is already authoritative; legacy storage cleanup is best effort.
  }
}

function emitHistoryUpdated() {
  window.dispatchEvent(new Event(WATCH_HISTORY_UPDATED));
}

function enqueueMutation(key, mutation) {
  const previous = mutationQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(mutation);
  const cleanup = current.finally(() => {
    if (mutationQueues.get(key) === cleanup) {
      mutationQueues.delete(key);
    }
  });

  mutationQueues.set(key, cleanup);
  return current;
}

export async function initializeWatchHistory() {
  if (initialized) {
    return { history: historyCache, migrated: false };
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const databaseHistory = await getWatchHistoryFromDatabase();
    let migrated = false;

    if (databaseHistory.count === 0) {
      const legacyHistory = readLegacyHistory();
      const legacyCount = Object.keys(legacyHistory).length;

      if (legacyCount > 0) {
        const migration = await migrateWatchHistoryToDatabase(legacyHistory);

        if (!migration.migrated && migration.count === 0) {
          throw new Error("Watch history migration did not create any database records.");
        }

        historyCache = normalizeHistory(migration.history);
        migrated = migration.migrated;
      } else {
        historyCache = {};
      }
    } else {
      historyCache = normalizeHistory(databaseHistory.history);
    }

    clearLegacyHistory();
    initialized = true;
    emitHistoryUpdated();

    return { history: historyCache, migrated };
  })();

  try {
    return await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

export function isWatchHistoryInitialized() {
  return initialized;
}

export function getWatchHistory() {
  return historyCache;
}

function createBaseItem(item, type, existing = {}, metadata = {}) {
  const timestamp = nowIso();
  const normalizedType = normalizeMediaType(type);
  const normalizedId = normalizeMediaId(item.id);
  const actors = normalizeArray(metadata.actors || metadata.cast);
  const directors = normalizeArray(metadata.directors);
  const studios = normalizeArray(metadata.studios);
  const keywords = normalizeArray(metadata.keywords);
  const genres = normalizeArray(metadata.genres).length
    ? normalizeArray(metadata.genres)
    : normalizeArray(existing.genres);

  return {
    ...existing,
    type: normalizedType,
    id: normalizedId,
    title: normalizedType === "movie" ? item.title : item.name,
    date:
      normalizedType === "movie" ? item.release_date : item.first_air_date,
    year: metadata.year ?? existing.year ?? null,
    poster_path: item.poster_path ?? existing.poster_path ?? null,
    genres,
    genre_ids: normalizeArray(metadata.genre_ids || existing.genre_ids),
    actors: actors.length ? actors : normalizeArray(existing.actors),
    directors: directors.length ? directors : normalizeArray(existing.directors),
    studios: studios.length ? studios : normalizeArray(existing.studios),
    keywords: keywords.length ? keywords : normalizeArray(existing.keywords),
    language: metadata.language ?? existing.language ?? null,
    popularity: metadata.popularity ?? existing.popularity ?? null,
    tmdbRating: metadata.tmdbRating ?? existing.tmdbRating ?? null,
    franchise: metadata.franchise ?? existing.franchise ?? null,
    createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp,
    lastInteractedAt: timestamp,
  };
}

async function persistHistoryItem(key, item) {
  if (item?.status == null && item?.favorite !== true) {
    delete historyCache[key];
    await deleteWatchHistoryItemFromDatabase(item.type, item.id);
  } else {
    const response = await saveWatchHistoryItem(item);
    historyCache[key] = normalizeHistoryItem(response.item || item);
  }

  emitHistoryUpdated();
}

export function setWatchStatus(item, type, status, metadata = {}) {
  const normalizedType = normalizeMediaType(type);
  const normalizedId = normalizeMediaId(item.id);
  const key = `${normalizedType}-${normalizedId}`;

  if (!normalizedType || !normalizedId) {
    return Promise.resolve();
  }

  return enqueueMutation(key, async () => {
    const existing = historyCache[key] || {};
    const previousStatus = existing.status || null;
    const timestamp = nowIso();

    if (previousStatus === status) {
      historyCache[key] = {
        ...existing,
        status: null,
        rating: null,
        ratingUpdatedAt: null,
        updatedAt: timestamp,
        statusChangedAt: timestamp,
        lastInteractedAt: timestamp,
      };
    } else {
      const next = createBaseItem(item, type, existing, metadata);

      historyCache[key] = {
        ...next,
        status,
        statusChangedAt: timestamp,
        rating: status === "watched" ? existing.rating || null : null,
        ratingUpdatedAt:
          status === "watched" ? existing.ratingUpdatedAt || null : null,
        favorite: existing.favorite === true,
        favoriteAt: existing.favoriteAt || null,
      };
    }

    try {
      await persistHistoryItem(key, historyCache[key]);
    } catch (error) {
      console.error("Unable to persist watch status", error);
      historyCache[key] = existing;
      if (!existing.status && existing.favorite !== true) {
        delete historyCache[key];
      }
      emitHistoryUpdated();
      throw error;
    }

    recordRecommendationInteraction(normalizedType, normalizedId, "status", {
      status: historyCache[key]?.status || null,
      previousStatus,
    });
  });
}

export function setWatchFavorite(item, type, metadata = {}) {
  const normalizedType = normalizeMediaType(type);
  const normalizedId = normalizeMediaId(item.id);
  const key = `${normalizedType}-${normalizedId}`;

  if (!normalizedType || !normalizedId) {
    return Promise.resolve();
  }

  return enqueueMutation(key, async () => {
    const existing = historyCache[key] || {};
    const next = createBaseItem(item, type, existing, metadata);
    const timestamp = nowIso();
    const favorite = existing.favorite !== true;

    historyCache[key] = {
      ...next,
      status: existing.status || null,
      rating: existing.status === "watched" ? existing.rating || null : null,
      favorite,
      favoriteAt: favorite ? timestamp : null,
    };

    try {
      await persistHistoryItem(key, historyCache[key]);
    } catch (error) {
      console.error("Unable to persist favorite", error);
      historyCache[key] = existing;
      if (!existing.status && existing.favorite !== true) {
        delete historyCache[key];
      }
      emitHistoryUpdated();
      throw error;
    }

    recordRecommendationInteraction(
      normalizedType,
      normalizedId,
      favorite ? "favorite" : "unfavorite",
    );
  });
}

export function getWatchFavorite(type, id) {
  const normalizedType = normalizeMediaType(type);
  const normalizedId = normalizeMediaId(id);
  return historyCache[`${normalizedType}-${normalizedId}`]?.favorite === true;
}

export async function migrateWatchHistoryGenres() {
  const entries = Object.entries(historyCache).filter(
    ([, item]) =>
      item?.id != null &&
      item?.type &&
      (!Array.isArray(item.genres) || item.genres.length === 0),
  );

  for (const [key, item] of entries) {
    try {
      const details = await getMediaDetails(item.type, item.id);
      const enriched = normalizeHistoryItem({
        ...item,
        title: details.title || item.title,
        date: details.date || item.date,
        year: details.year ?? item.year ?? null,
        genres: details.genres || [],
        genre_ids: details.genre_ids || [],
        actors: details.actors || [],
        directors: details.directors || [],
        studios: details.studios || [],
        keywords: details.keywords || [],
        language: details.language || null,
        popularity: details.popularity ?? null,
        tmdbRating: details.tmdbRating ?? null,
        franchise: details.franchise || null,
      });

      historyCache[key] = enriched;
      await persistHistoryItem(key, enriched);
    } catch (error) {
      console.error(`Unable to migrate metadata for ${item.type}-${item.id}`, error);
    }
  }

  emitHistoryUpdated();
}

export function getWatchRating(type, id) {
  const normalizedType = normalizeMediaType(type);
  const normalizedId = normalizeMediaId(id);
  const item = historyCache[`${normalizedType}-${normalizedId}`];

  if (item?.status !== "watched") {
    return null;
  }

  return item.rating || null;
}

export function setWatchRating(type, id, rating) {
  const normalizedType = normalizeMediaType(type);
  const normalizedId = normalizeMediaId(id);
  const key = `${normalizedType}-${normalizedId}`;

  if (!normalizedType || !normalizedId) {
    return Promise.resolve();
  }

  return enqueueMutation(key, async () => {
    const existing = historyCache[key];

    if (!existing || existing.status !== "watched") {
      return;
    }

    const timestamp = nowIso();

    historyCache[key] = {
      ...existing,
      rating: existing.rating === rating ? null : rating,
      ratingUpdatedAt: timestamp,
      updatedAt: timestamp,
      lastInteractedAt: timestamp,
    };

    try {
      await persistHistoryItem(key, historyCache[key]);
    } catch (error) {
      historyCache[key] = existing;
      emitHistoryUpdated();
      throw error;
    }

    recordRecommendationInteraction(normalizedType, normalizedId, "rating", {
      rating: historyCache[key]?.rating || null,
    });
  });
}
