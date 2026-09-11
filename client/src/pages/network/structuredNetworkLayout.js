const CONNECTION_TYPE_ORDER = [
  "actor",
  "director",
  "franchise",
  "genre",
  "studio",
  "keyword",
  "language",
  "decade",
  "mediaType",
];

const MOVIE_X_GAP = 220;
const MOVIE_Y_GAP = 170;
const CONNECTION_OFFSET = 72;
const MAX_MOVIE_COLUMNS = 7;

function compareNodes(a, b) {
  return (
    String(a.displayLabel || a.label || a.title || "").localeCompare(
      String(b.displayLabel || b.label || b.title || ""),
    ) || String(a.id).localeCompare(String(b.id))
  );
}

function sortConnectionTypes(types) {
  return [...types].sort(
    (a, b) =>
      (CONNECTION_TYPE_ORDER.indexOf(a) === -1
        ? CONNECTION_TYPE_ORDER.length
        : CONNECTION_TYPE_ORDER.indexOf(a)) -
        (CONNECTION_TYPE_ORDER.indexOf(b) === -1
          ? CONNECTION_TYPE_ORDER.length
          : CONNECTION_TYPE_ORDER.indexOf(b)) ||
      a.localeCompare(b),
  );
}

function connectionKey(node) {
  return `${node.connectionType || "connection"}:${node.id}`;
}

function getConnectedMediaIds(node, mediaIds) {
  return (node.connectedMediaIds || []).filter((id) => mediaIds.has(id));
}

function scoreMoviePair(a, b, connectionsByMedia) {
  const aConnections = connectionsByMedia.get(a.id) || new Set();
  const bConnections = connectionsByMedia.get(b.id) || new Set();

  let shared = 0;
  for (const connection of aConnections) {
    if (bConnections.has(connection)) shared += 1;
  }

  return shared;
}

/**
 * Builds a deterministic interlocked 2D network.
 *
 * Movies form a compact mesh first. Connection nodes are then projected into
 * the spaces around the movie mesh according to the movies they connect,
 * rather than being segregated into type-specific vertical lanes.
 *
 * This deliberately avoids force simulation: the same graph always produces
 * the same coordinates while still allowing local relationship neighborhoods.
 */
export function buildStructuredNetworkLayout(nodes) {
  const mediaNodes = nodes
    .filter((node) => node.type === "media")
    .sort(compareNodes);
  const connectionNodes = nodes
    .filter((node) => node.type === "connection")
    .sort(compareNodes);

  const mediaIds = new Set(mediaNodes.map((node) => node.id));
  const connectionsByMedia = new Map(
    mediaNodes.map((node) => [node.id, new Set()]),
  );

  for (const node of connectionNodes) {
    const key = connectionKey(node);
    for (const mediaId of getConnectedMediaIds(node, mediaIds)) {
      connectionsByMedia.get(mediaId)?.add(key);
    }
  }

  // Greedily order titles so each new title prefers a nearby title with
  // shared relationships. This produces a mesh-like traversal without a
  // stochastic or force-directed layout.
  const remaining = new Set(mediaNodes.map((node) => node.id));
  const orderedMedia = [];
  let current = mediaNodes[0];

  while (current) {
    orderedMedia.push(current);
    remaining.delete(current.id);

    let next = null;
    let bestScore = -1;

    for (const candidate of mediaNodes) {
      if (!remaining.has(candidate.id)) continue;
      const score = scoreMoviePair(current, candidate, connectionsByMedia);

      if (
        score > bestScore ||
        (score === bestScore &&
          String(candidate.id).localeCompare(String(next?.id || "")) < 0)
      ) {
        next = candidate;
        bestScore = score;
      }
    }

    current = next;
  }

  const columns = Math.min(
    MAX_MOVIE_COLUMNS,
    Math.max(1, Math.ceil(Math.sqrt(Math.max(orderedMedia.length, 1)))),
  );
  const rows = Math.max(1, Math.ceil(orderedMedia.length / columns));
  const positions = {};

  orderedMedia.forEach((node, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const stagger = row % 2 ? MOVIE_X_GAP / 2 : 0;

    positions[node.id] = {
      x: column * MOVIE_X_GAP + stagger,
      y: row * MOVIE_Y_GAP,
    };
  });

  // Connection nodes are placed around the centroid of their connected
  // movies. The deterministic offset alternates by connection type and
  // degree, creating an interlocking weave instead of metadata lanes.
  const connectionTypes = sortConnectionTypes(
    new Set(connectionNodes.map((node) => node.connectionType)),
  );
  const typeRanks = new Map(connectionTypes.map((type, index) => [type, index]));

  const occupied = new Set();

  connectionNodes.forEach((node, index) => {
    const connectedMedia = getConnectedMediaIds(node, mediaIds)
      .map((id) => positions[id])
      .filter(Boolean);

    if (!connectedMedia.length) {
      positions[node.id] = {
        x: (index % columns) * MOVIE_X_GAP,
        y: Math.floor(index / columns) * MOVIE_Y_GAP + CONNECTION_OFFSET,
      };
      return;
    }

    const centroid = connectedMedia.reduce(
      (point, position) => ({
        x: point.x + position.x / connectedMedia.length,
        y: point.y + position.y / connectedMedia.length,
      }),
      { x: 0, y: 0 },
    );

    const typeRank = typeRanks.get(node.connectionType) ?? 0;
    const direction = index % 2 === 0 ? 1 : -1;
    const angle = ((typeRank % 4) * Math.PI) / 4;
    const degreeFactor = Math.min(connectedMedia.length, 4);
    const radius = CONNECTION_OFFSET + degreeFactor * 10;

    let position = {
      x: centroid.x + Math.cos(angle) * radius * direction,
      y: centroid.y + Math.sin(angle) * radius * direction,
    };

    // Deterministically nudge collisions so hubs do not disappear on top of
    // one another while remaining close to their relationship neighborhood.
    const positionKey = `${Math.round(position.x)}:${Math.round(position.y)}`;
    if (occupied.has(positionKey)) {
      position = {
        x: position.x + CONNECTION_OFFSET * 0.6,
        y: position.y + CONNECTION_OFFSET * 0.6,
      };
    }

    occupied.add(`${Math.round(position.x)}:${Math.round(position.y)}`);
    positions[node.id] = position;
  });

  return positions;
}

export const STRUCTURED_NETWORK_LAYOUT = {
  name: "preset",
  fit: true,
  padding: 70,
};
