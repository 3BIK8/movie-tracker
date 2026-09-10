import { getMediaDetails } from "./api";

const STORAGE_KEY = "my-watch-history";

export const WATCH_HISTORY_UPDATED = "watch-history-updated";

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
  if (!history || typeof history !== "object" || Array.isArray(history)) {
    return {};
  }

  const normalized = {};

  for (const [key, item] of Object.entries(history)) {
    if (!item || typeof item !== "object") {
      normalized[key] = item;
      continue;
    }

    const type = normalizeMediaType(item.type);
    const id = normalizeMediaId(item.id);

    if (!type || !id) {
      normalized[key] = item;
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
    franchise: metadata.franchise ?? existing.franchise ?? null,
    createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp,
    lastInteractedAt: timestamp,
  };
}

export function getWatchHistory() {
  try {
    return normalizeHistory(
      JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
    );
  } catch {
    return {};
  }
}

export function setWatchStatus(item, type, status, metadata = {}) {
  const history = getWatchHistory();
  const normalizedType = normalizeMediaType(type);
  const normalizedId = normalizeMediaId(item.id);
  const key = `${normalizedType}-${normalizedId}`;

  if (!normalizedType || !normalizedId) {
    return;
  }

  if (history[key]?.status === status) {
    const timestamp = nowIso();
    history[key] = {
      ...history[key],
      status: null,
      updatedAt: timestamp,
      statusChangedAt: timestamp,
      lastInteractedAt: timestamp,
    };
  } else {
    const existing = history[key] || {};
    const next = createBaseItem(item, type, existing, metadata);
    const timestamp = nowIso();

    history[key] = {
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

  if (history[key]?.status == null && history[key]?.favorite !== true) {
    delete history[key];
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  window.dispatchEvent(new Event(WATCH_HISTORY_UPDATED));
}

export function setWatchFavorite(item, type, metadata = {}) {
  const history = getWatchHistory();
  const normalizedType = normalizeMediaType(type);
  const normalizedId = normalizeMediaId(item.id);
  const key = `${normalizedType}-${normalizedId}`;

  if (!normalizedType || !normalizedId) {
    return;
  }

  const existing = history[key] || {};
  const next = createBaseItem(item, type, existing, metadata);
  const timestamp = nowIso();
  const favorite = existing.favorite !== true;

  history[key] = {
    ...next,
    status: existing.status || null,
    rating: existing.status === "watched" ? existing.rating || null : null,
    favorite,
    favoriteAt: favorite ? timestamp : null,
  };

  if (history[key].status == null && !favorite) {
    delete history[key];
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  window.dispatchEvent(new Event(WATCH_HISTORY_UPDATED));
}

export function getWatchFavorite(type, id) {
  const history = getWatchHistory();
  const normalizedType = normalizeMediaType(type);
  const normalizedId = normalizeMediaId(id);
  return history[`${normalizedType}-${normalizedId}`]?.favorite === true;
}

export async function migrateWatchHistoryGenres() {
  const history = getWatchHistory();
  let changed = false;

  for (const [key, value] of Object.entries(history)) {
    if (typeof value !== "string") {
      continue;
    }

    const match = key.match(/^(movie|tv)-(\d+)$/);

    if (!match) {
      continue;
    }

    const [, type, id] = match;
    const timestamp = nowIso();

    history[key] = {
      status: value,
      type,
      id,
      title: "",
      date: "",
      poster_path: null,
      genres: [],
      rating: null,
      favorite: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      statusChangedAt: timestamp,
      lastInteractedAt: timestamp,
    };

    changed = true;
  }

  const entries = Object.entries(history).filter(
    ([, item]) =>
      item?.id != null &&
      item?.type &&
      (!Array.isArray(item.genres) || item.genres.length === 0),
  );

  for (const [key, item] of entries) {
    try {
      const details = await getMediaDetails(item.type, item.id);

      history[key] = {
        ...history[key],
        title: details.title || history[key].title,
        date: details.date || history[key].date,
        year: details.year ?? history[key].year ?? null,
        genres: details.genres || [],
        genre_ids: details.genre_ids || [],
        actors: details.actors || [],
        directors: details.directors || [],
        studios: details.studios || [],
        keywords: details.keywords || [],
        language: details.language || null,
        popularity: details.popularity ?? null,
        franchise: details.franchise || null,
      };

      changed = true;
    } catch (error) {
      console.error(
        `Unable to migrate genres for ${item.type}-${item.id}`,
        error,
      );
    }
  }

  if (changed) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    window.dispatchEvent(new Event(WATCH_HISTORY_UPDATED));
  }
}

export function getWatchRating(type, id) {
  const history = getWatchHistory();
  const normalizedType = normalizeMediaType(type);
  const normalizedId = normalizeMediaId(id);
  const item = history[`${normalizedType}-${normalizedId}`];

  if (item?.status !== "watched") {
    return null;
  }

  return item.rating || null;
}

export function setWatchRating(type, id, rating) {
  const history = getWatchHistory();
  const normalizedType = normalizeMediaType(type);
  const normalizedId = normalizeMediaId(id);
  const key = `${normalizedType}-${normalizedId}`;

  if (!history[key] || history[key].status !== "watched") {
    return;
  }

  const timestamp = nowIso();

  history[key] = {
    ...history[key],
    rating: history[key].rating === rating ? null : rating,
    ratingUpdatedAt: timestamp,
    updatedAt: timestamp,
    lastInteractedAt: timestamp,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  window.dispatchEvent(new Event(WATCH_HISTORY_UPDATED));
}
