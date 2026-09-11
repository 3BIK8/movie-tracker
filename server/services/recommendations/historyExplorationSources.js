const SOURCE_TYPES = Object.freeze({
  actor: "actors",
  director: "directors",
  genre: "genres",
  franchise: "franchises",
  studio: "studios",
  keyword: "keywords",
});

const CONNECTION_FIELDS = Object.freeze([
  "actors",
  "directors",
  "genres",
  "franchises",
  "studios",
  "keywords",
]);

const MAX_SOURCES_PER_TYPE = Object.freeze({
  actors: 6,
  directors: 6,
  franchises: 6,
  genres: 4,
  studios: 4,
  keywords: 6,
});

const MAX_HISTORY_EXPLORATION_SOURCES = 32;

function normalizeConnection(connection, fallbackType = null) {
  if (connection === null || connection === undefined) {
    return null;
  }

  if (typeof connection !== "object") {
    if (!fallbackType || connection === "") {
      return null;
    }

    return {
      type: fallbackType,
      value: String(connection),
    };
  }

  const sourceType = fallbackType || SOURCE_TYPES[connection.type];
  const value = connection.value ?? connection.id ?? connection.name;

  if (!sourceType || value === null || value === undefined || value === "") {
    return null;
  }

  return {
    type: sourceType,
    value: String(value),
  };
}

function getItemConnections(item) {
  const connections = Array.isArray(item?.connections)
    ? item.connections
        .map((connection) => normalizeConnection(connection))
        .filter(Boolean)
    : [];

  if (connections.length > 0) {
    return connections;
  }

  const fallback = [];

  for (const field of CONNECTION_FIELDS) {
    for (const connection of Array.isArray(item?.[field]) ? item[field] : []) {
      const normalized = normalizeConnection(connection, field);

      if (normalized) {
        fallback.push(normalized);
      }
    }
  }

  return fallback;
}

function isWatchedHistoryItem(item) {
  if (item?.status === "watched") {
    return true;
  }

  // A persisted rating is only possible through the watched flow. Treat it
  // as a watched signal for retrieval resilience when status was compacted or
  // migrated incorrectly; it still contributes zero taste evidence here.
  return ["S", "A", "B", "C", "D"].includes(item?.rating);
}

export function getHistoryExplorationSources(history, mediaType) {
  const sourceCounts = new Map();
  let watchedHistoryItems = 0;
  let historyConnectionCount = 0;

  for (const item of Array.isArray(history) ? history : []) {
    if (item?.type !== mediaType || !isWatchedHistoryItem(item)) {
      continue;
    }

    watchedHistoryItems += 1;

    for (const connection of getItemConnections(item)) {
      historyConnectionCount += 1;
      const key = `${connection.type}:${connection.value}`;
      const existing = sourceCounts.get(key) || {
        ...connection,
        appearances: 0,
      };
      existing.appearances += 1;
      sourceCounts.set(key, existing);
    }
  }

  const selected = [];

  for (const sourceType of Object.values(SOURCE_TYPES)) {
    const typeSources = [...sourceCounts.values()]
      .filter((source) => source.type === sourceType)
      .sort((a, b) => {
        if (b.appearances !== a.appearances) {
          return b.appearances - a.appearances;
        }
        return `${a.type}:${a.value}`.localeCompare(`${b.type}:${b.value}`);
      })
      .slice(0, MAX_SOURCES_PER_TYPE[sourceType]);

    selected.push(...typeSources);
  }

  return {
    sources: selected
      .sort((a, b) => {
        if (b.appearances !== a.appearances) {
          return b.appearances - a.appearances;
        }
        return `${a.type}:${a.value}`.localeCompare(`${b.type}:${b.value}`);
      })
      .slice(0, MAX_HISTORY_EXPLORATION_SOURCES)
      .map((source) => ({
        type: source.type,
        value: source.value,
        evidenceScore: 0,
        confidence: 0,
        appearances: source.appearances,
        pool: "exploration",
      })),
    watchedHistoryItems,
    historyConnectionCount,
  };
}

export {
  MAX_HISTORY_EXPLORATION_SOURCES,
  MAX_SOURCES_PER_TYPE,
  SOURCE_TYPES,
};
