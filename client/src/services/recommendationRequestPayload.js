const MAX_HISTORY_BYTES = 56 * 1024;
const MAX_HISTORY_ITEMS = 180;
const MAX_CONNECTIONS_PER_ITEM = 20;
const CONNECTION_FIELDS = [
  "actors",
  "directors",
  "genres",
  "franchises",
  "studios",
  "keywords",
];

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function compactConnection(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  const id = value.id ?? null;
  const name = value.name ?? null;

  if (id === null && name === null) {
    return null;
  }

  return { id, name };
}

function compactConnections(values) {
  const result = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const compacted = compactConnection(value);

    if (!compacted) {
      continue;
    }

    const key = JSON.stringify(compacted);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(compacted);

    if (result.length >= MAX_CONNECTIONS_PER_ITEM) {
      break;
    }
  }

  return result;
}

function compactHistoryItem(item) {
  const compacted = {
    type: item.type,
    id: String(item.id),
    status: item.status || null,
    rating: item.rating || null,
    favorite: item.favorite === true,
    year: item.year ?? null,
    language: item.language ?? null,
    popularity: typeof item.popularity === "number" ? item.popularity : null,
    tmdbRating: typeof item.tmdbRating === "number" ? item.tmdbRating : null,
    createdAt: item.createdAt || null,
    statusChangedAt: item.statusChangedAt || null,
    ratingUpdatedAt: item.ratingUpdatedAt || null,
    favoriteAt: item.favoriteAt || null,
    lastInteractedAt: item.lastInteractedAt || item.updatedAt || null,
  };

  for (const field of CONNECTION_FIELDS) {
    compacted[field] = compactConnections(item[field]);
  }

  return compacted;
}

function getHistoryItems(history) {
  if (!history || typeof history !== "object" || Array.isArray(history)) {
    return [];
  }

  return Object.values(history)
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        item.type &&
        item.id != null,
    )
    .sort((a, b) => {
      const aTime = Date.parse(a.lastInteractedAt || a.updatedAt || "") || 0;
      const bTime = Date.parse(b.lastInteractedAt || b.updatedAt || "") || 0;
      return bTime - aTime;
    });
}

export function compactRecommendationHistory(
  history,
  maxBytes = MAX_HISTORY_BYTES,
) {
  const items = getHistoryItems(history);
  const compacted = [];

  for (const item of items.slice(0, MAX_HISTORY_ITEMS)) {
    const candidate = [compactHistoryItem(item), ...compacted];

    if (byteLength(candidate) > maxBytes) {
      break;
    }

    compacted.unshift(compactHistoryItem(item));
  }

  return compacted;
}

export { MAX_HISTORY_BYTES, MAX_HISTORY_ITEMS, MAX_CONNECTIONS_PER_ITEM };
