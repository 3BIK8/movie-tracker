const DEFAULT_MAX_BYTES = 48 * 1024;
const MAX_EXPOSURES = 300;
const MAX_CONNECTIONS_PER_EXPOSURE = 24;
const MAX_INTERACTIONS_PER_EXPOSURE = 12;

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function normalizeConnection(connection) {
  if (!connection || typeof connection !== "object") {
    return null;
  }

  const type = String(connection.type || "").trim();
  const value = String(connection.value ?? "").trim();

  if (!type || !value) {
    return null;
  }

  return { type, value };
}

function compactExposure(exposure) {
  const connections = [];
  const seenConnections = new Set();

  for (const connection of exposure.connections || []) {
    const normalized = normalizeConnection(connection);

    if (!normalized) {
      continue;
    }

    const key = `${normalized.type}:${normalized.value}`;

    if (seenConnections.has(key)) {
      continue;
    }

    seenConnections.add(key);
    connections.push(normalized);

    if (connections.length >= MAX_CONNECTIONS_PER_EXPOSURE) {
      break;
    }
  }

  const interactions = (exposure.interactions || [])
    .filter(
      (interaction) =>
        interaction &&
        typeof interaction === "object" &&
        typeof interaction.event === "string",
    )
    .slice(-MAX_INTERACTIONS_PER_EXPOSURE)
    .map((interaction) => ({
      event: interaction.event,
      timestamp: interaction.timestamp || null,
    }));

  return {
    type: exposure.type,
    id: String(exposure.id),
    pool: exposure.pool || null,
    exposedAt: exposure.exposedAt || null,
    connections,
    interactions,
  };
}

export function compactRecommendationFeedback(
  feedback,
  maxBytes = DEFAULT_MAX_BYTES,
) {
  if (!feedback || !Array.isArray(feedback.exposures)) {
    return null;
  }

  const exposures = [];

  for (const exposure of [...feedback.exposures].reverse()) {
    if (!exposure || !exposure.type || exposure.id === undefined) {
      continue;
    }

    const compacted = compactExposure(exposure);
    const candidate = {
      exposures: [compacted, ...exposures],
    };

    if (byteLength(candidate) > maxBytes) {
      break;
    }

    exposures.unshift(compacted);

    if (exposures.length >= MAX_EXPOSURES) {
      break;
    }
  }

  return { exposures };
}

export {
  DEFAULT_MAX_BYTES,
  MAX_CONNECTIONS_PER_EXPOSURE,
  MAX_EXPOSURES,
  MAX_INTERACTIONS_PER_EXPOSURE,
};
