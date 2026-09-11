const MAX_CONNECTION_NODES = 400;
const MAX_MEDIA_PER_CONNECTION = 30;
const MAX_EDGES = 4000;

const PROFILE_DIMENSION_BY_CONNECTION = Object.freeze({
  actor: "actors",
  director: "directors",
  genre: "genres",
  franchise: "franchises",
  studio: "studios",
  keyword: "keywords",
  decade: "years",
  language: "languages",
  mediaType: "mediaTypes",
});

function getConnectionId(type, value) {
  return `connection-${type}-${value}`;
}

function addNode(nodes, node) {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node);
  }
}

function addEdge(edges, source, target, extra = {}) {
  if (edges.size >= MAX_EDGES) {
    return false;
  }

  const id = `${source}->${target}`;

  if (!edges.has(id)) {
    edges.set(id, {
      id,
      source,
      target,
      ...extra,
    });
  }

  return true;
}

function compareConnections(a, b) {
  if (b.mediaIds.length !== a.mediaIds.length) {
    return b.mediaIds.length - a.mediaIds.length;
  }

  const typeCompare = a.type.localeCompare(b.type);

  if (typeCompare !== 0) {
    return typeCompare;
  }

  return String(a.value).localeCompare(String(b.value));
}

function getPersonalEvidence(tasteProfile, mediaType, type, value) {
  const dimension = PROFILE_DIMENSION_BY_CONNECTION[type];
  const mediaProfile = tasteProfile?.mediaTypes?.[
    mediaType === "movie" ? "movies" : "tv"
  ];
  const signal = mediaProfile?.dimensions?.[dimension]?.[String(value)];

  if (!signal) {
    return {
      state: "unknown",
      evidenceScore: 0,
      temporalEvidenceScore: 0,
      confidence: 0,
      appearances: 0,
    };
  }

  return {
    state: signal.direction,
    evidenceScore: signal.evidenceScore,
    temporalEvidenceScore: signal.temporalEvidenceScore,
    confidence: signal.confidence,
    appearances: signal.appearances,
  };
}

function buildConnectionMap(mediaRecords) {
  const connectionMap = new Map();

  for (const record of mediaRecords) {
    const mediaNodeId = record.mediaNode.id;
    const seen = new Set();

    for (const connection of record.connections) {
      const type = String(connection.type || "").trim();
      const value = String(connection.value ?? "").trim();

      if (!type || !value) {
        continue;
      }

      const key = `${type}:${value}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      if (!connectionMap.has(key)) {
        connectionMap.set(key, {
          type,
          value,
          label: connection.label || value,
          metadata: connection.metadata || {},
          mediaIds: [],
        });
      }

      connectionMap.get(key).mediaIds.push(mediaNodeId);
    }
  }

  return [...connectionMap.values()]
    .filter((connection) => connection.mediaIds.length >= 2)
    .map((connection) => ({
      ...connection,
      mediaIds: [...new Set(connection.mediaIds)].sort(),
    }))
    .sort(compareConnections)
    .slice(0, MAX_CONNECTION_NODES);
}

export function buildGraph(mediaRecords, tasteProfile = null) {
  const nodes = new Map();
  const edges = new Map();
  const connections = buildConnectionMap(mediaRecords);

  for (const record of mediaRecords) {
    addNode(nodes, record.mediaNode);
  }

  for (const connection of connections) {
    const mediaIds = connection.mediaIds.slice(0, MAX_MEDIA_PER_CONNECTION);

    if (mediaIds.length < 2) {
      continue;
    }

    const connectionId = getConnectionId(connection.type, connection.value);
    const firstMedia = mediaRecords.find(
      (record) => record.mediaNode.id === mediaIds[0],
    );
    const mediaType = firstMedia?.mediaNode?.mediaType;

    addNode(nodes, {
      id: connectionId,
      type: "connection",
      connectionType: connection.type,
      label: connection.label,
      count: mediaIds.length,
      connectedMediaIds: mediaIds,
      personalEvidence: getPersonalEvidence(
        tasteProfile,
        mediaType,
        connection.type,
        connection.value,
      ),
      ...connection.metadata,
    });

    for (const mediaId of mediaIds) {
      if (!addEdge(edges, mediaId, connectionId)) {
        break;
      }
    }

    if (edges.size >= MAX_EDGES) {
      break;
    }
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}

export const NETWORK_GRAPH_LIMITS = Object.freeze({
  maxConnectionNodes: MAX_CONNECTION_NODES,
  maxMediaPerConnection: MAX_MEDIA_PER_CONNECTION,
  maxEdges: MAX_EDGES,
});
