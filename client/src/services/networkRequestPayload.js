const MAX_NETWORK_HISTORY_ITEMS = 180;
const MAX_NETWORK_PAYLOAD_BYTES = 40 * 1024;
const PERSONAL_RATINGS = new Set(["S", "A", "B", "C", "D"]);

function normalizeTimestamp(value) {
  return typeof value === "string" && value ? value : null;
}

function normalizeRating(value) {
  if (typeof value !== "string") {
    return null;
  }

  const rating = value.trim().toUpperCase();
  return PERSONAL_RATINGS.has(rating) ? rating : null;
}

function compactItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const type = typeof item.type === "string" ? item.type.trim().toLowerCase() : "";
  const id = String(item.id ?? "").trim();

  if (!/^(movie|tv)$/.test(type) || !/^\d+$/.test(id) || id === "0") {
    return null;
  }

  return {
    type,
    id: id.replace(/^0+/, ""),
    status: typeof item.status === "string" ? item.status : null,
    rating: normalizeRating(item.rating),
    favorite: item.favorite === true,
    createdAt: normalizeTimestamp(item.createdAt),
    statusChangedAt: normalizeTimestamp(item.statusChangedAt),
    ratingUpdatedAt: normalizeTimestamp(item.ratingUpdatedAt),
    favoriteAt: normalizeTimestamp(item.favoriteAt),
    lastInteractedAt: normalizeTimestamp(item.lastInteractedAt || item.updatedAt),
  };
}

function getRecency(item) {
  return Date.parse(item.lastInteractedAt || item.createdAt || "") || 0;
}

function hasPersonalEvidence(item) {
  return item.status === "watched" && PERSONAL_RATINGS.has(item.rating) && item.rating !== "C";
}

function sortByPriority(items) {
  return [...items].sort((a, b) => {
    const aEvidence = hasPersonalEvidence(a) ? 1 : 0;
    const bEvidence = hasPersonalEvidence(b) ? 1 : 0;

    if (bEvidence !== aEvidence) {
      return bEvidence - aEvidence;
    }

    if (b.favorite !== a.favorite) {
      return Number(b.favorite) - Number(a.favorite);
    }

    const recencyCompare = getRecency(b) - getRecency(a);

    if (recencyCompare !== 0) {
      return recencyCompare;
    }

    return `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`);
  });
}

function allocateTypeCounts(movieCount, tvCount, limit) {
  const total = movieCount + tvCount;

  if (total <= limit) {
    return { movie: movieCount, tv: tvCount };
  }

  if (movieCount === 0) {
    return { movie: 0, tv: limit };
  }

  if (tvCount === 0) {
    return { movie: limit, tv: 0 };
  }

  const movieExact = (limit * movieCount) / total;
  const tvExact = (limit * tvCount) / total;
  let movie = Math.floor(movieExact);
  let tv = Math.floor(tvExact);

  movie = Math.max(1, movie);
  tv = Math.max(1, tv);

  while (movie + tv < limit) {
    const movieRemainder = movieExact - movie;
    const tvRemainder = tvExact - tv;

    if (movie < movieCount && (movieRemainder > tvRemainder || tv >= tvCount)) {
      movie += 1;
    } else if (tv < tvCount) {
      tv += 1;
    } else {
      break;
    }
  }

  while (movie + tv > limit) {
    const movieRemainder = movieExact - movie;
    const tvRemainder = tvExact - tv;

    if (movie > 1 && (movieRemainder < tvRemainder || tv >= tvCount)) {
      movie -= 1;
    } else if (tv > 1) {
      tv -= 1;
    } else {
      break;
    }
  }

  return { movie, tv };
}

function selectHistoryItems(items) {
  const sorted = sortByPriority(items);
  const movies = sorted.filter((item) => item.type === "movie");
  const tv = sorted.filter((item) => item.type === "tv");
  const allocation = allocateTypeCounts(movies.length, tv.length, MAX_NETWORK_HISTORY_ITEMS);

  return [
    ...movies.slice(0, allocation.movie),
    ...tv.slice(0, allocation.tv),
  ].sort((a, b) => {
    const recencyCompare = getRecency(b) - getRecency(a);

    if (recencyCompare !== 0) {
      return recencyCompare;
    }

    return `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`);
  });
}

export function compactNetworkHistory(history) {
  const source = Array.isArray(history) ? history : Object.values(history || {});
  const seen = new Set();
  const compacted = [];

  for (const item of source) {
    const compactItemValue = compactItem(item);

    if (!compactItemValue) {
      continue;
    }

    const key = `${compactItemValue.type}:${compactItemValue.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    compacted.push(compactItemValue);
  }

  let result = selectHistoryItems(compacted);

  while (result.length > 0) {
    const payload = JSON.stringify({ history: result });

    if (new TextEncoder().encode(payload).byteLength <= MAX_NETWORK_PAYLOAD_BYTES) {
      return result;
    }

    result = result.slice(0, -1);
  }

  return [];
}

export const NETWORK_REQUEST_LIMITS = Object.freeze({
  maxItems: MAX_NETWORK_HISTORY_ITEMS,
  maxPayloadBytes: MAX_NETWORK_PAYLOAD_BYTES,
});
