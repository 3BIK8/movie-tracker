import { getMediaDetails } from "./api";

const STORAGE_KEY = "my-watch-history";

export const WATCH_HISTORY_UPDATED = "watch-history-updated";

export function getWatchHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function setWatchStatus(item, type, status, metadata = {}) {
  const history = getWatchHistory();
  const key = `${type}-${item.id}`;

  // Clicking the same status again clears it.
  if (history[key]?.status === status) {
    delete history[key];
  } else {
    const existingGenres = history[key]?.genres || [];

    const genres = Array.isArray(metadata.genres)
      ? metadata.genres
          .map((genre) => (typeof genre === "string" ? genre : genre?.name))
          .filter(Boolean)
      : existingGenres;

    history[key] = {
      status,
      type,
      id: item.id,
      title: type === "movie" ? item.title : item.name,
      date: type === "movie" ? item.release_date : item.first_air_date,
      poster_path: item.poster_path,
      genres,

      // Ratings only exist for watched items.
      rating: status === "watched" ? history[key]?.rating || null : null,
    };
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

  window.dispatchEvent(new Event(WATCH_HISTORY_UPDATED));
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

    history[key] = {
      status: value,
      type,
      id: Number(id),
      title: "",
      date: "",
      poster_path: null,
      genres: [],
      rating: null,
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

      const genres = Array.isArray(details.genres)
        ? details.genres
            .map((genre) => (typeof genre === "string" ? genre : genre?.name))
            .filter(Boolean)
        : [];

      history[key] = {
        ...history[key],
        title: details.title || history[key].title,
        date: details.date || history[key].date,
        genres,
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

  const item = history[`${type}-${id}`];

  if (item?.status !== "watched") {
    return null;
  }

  return item.rating || null;
}

export function setWatchRating(type, id, rating) {
  const history = getWatchHistory();
  const key = `${type}-${id}`;

  if (!history[key] || history[key].status !== "watched") {
    return;
  }

  history[key] = {
    ...history[key],
    rating: history[key].rating === rating ? null : rating,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

  window.dispatchEvent(new Event(WATCH_HISTORY_UPDATED));
}
