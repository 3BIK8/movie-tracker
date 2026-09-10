const MAX_EXPOSURES = 300;
const MAX_CONNECTIONS_PER_EXPOSURE = 24;
const MAX_INTERACTIONS_PER_EXPOSURE = 12;
const ALLOWED_TYPES = new Set(["movie", "tv"]);
const ALLOWED_INTERACTIONS = new Set([
  "opened",
  "status",
  "rating",
  "favorite",
  "skipped",
  "ignored",
]);

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

function normalizeExposure(exposure) {
  if (!exposure || typeof exposure !== "object") {
    return null;
  }

  const type = String(exposure.type || "").trim().toLowerCase();
  const id = String(exposure.id ?? "").trim();

  if (!ALLOWED_TYPES.has(type) || !id) {
    return null;
  }

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
        ALLOWED_INTERACTIONS.has(interaction.event),
    )
    .slice(-MAX_INTERACTIONS_PER_EXPOSURE)
    .map((interaction) => ({
      event: interaction.event,
      timestamp: interaction.timestamp || null,
    }));

  return {
    type,
    id,
    pool: exposure.pool || null,
    exposedAt: exposure.exposedAt || null,
    connections,
    interactions,
  };
}

export function normalizeRecommendationFeedback(feedback) {
  if (!feedback || !Array.isArray(feedback.exposures)) {
    return null;
  }

  const exposures = feedback.exposures
    .slice(-MAX_EXPOSURES)
    .map(normalizeExposure)
    .filter(Boolean);

  return { exposures };
}

export {
  MAX_CONNECTIONS_PER_EXPOSURE,
  MAX_EXPOSURES,
  MAX_INTERACTIONS_PER_EXPOSURE,
};
