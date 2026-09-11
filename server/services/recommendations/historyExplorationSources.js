const SOURCE_TYPES = Object.freeze({
  actor: "actors",
  director: "directors",
  genre: "genres",
  franchise: "franchises",
  studio: "studios",
  keyword: "keywords",
});

const MAX_SOURCES_PER_TYPE = Object.freeze({
  actors: 6,
  directors: 6,
  franchises: 6,
  genres: 4,
  studios: 4,
  keywords: 6,
});

const MAX_HISTORY_EXPLORATION_SOURCES = 32;

function normalizeConnection(connection) {
  if (!connection || typeof connection !== "object") {
    return null;
  }

  const sourceType = SOURCE_TYPES[connection.type];
  const value = connection.value;

  if (!sourceType || value === null || value === undefined || value === "") {
    return null;
  }

  return {
    type: sourceType,
    value: String(value),
  };
}

export function getHistoryExplorationSources(history, mediaType) {
  const sourceCounts = new Map();

  for (const item of Array.isArray(history) ? history : []) {
    if (item?.type !== mediaType || item.status !== "watched") {
      continue;
    }

    for (const connection of Array.isArray(item.connections)
      ? item.connections
      : []) {
      const normalized = normalizeConnection(connection);

      if (!normalized) {
        continue;
      }

      const key = `${normalized.type}:${normalized.value}`;
      const existing = sourceCounts.get(key) || {
        ...normalized,
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

  return selected
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
    }));
}

export {
  MAX_HISTORY_EXPLORATION_SOURCES,
  MAX_SOURCES_PER_TYPE,
  SOURCE_TYPES,
};
