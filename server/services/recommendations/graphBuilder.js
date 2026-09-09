function getConnectionId(type, value) {
  return `connection-${type}-${value}`;
}

function addNode(nodes, node) {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node);
  }
}

function addEdge(edges, source, target, extra = {}) {
  const id = `${source}->${target}`;

  if (!edges.has(id)) {
    edges.set(id, {
      id,
      source,
      target,
      ...extra,
    });
  }
}

function buildSharedConnections(nodes, edges, mediaRecords) {
  const connectionMap = new Map();

  for (const record of mediaRecords) {
    const mediaNodeId = record.mediaNode.id;
    const seen = new Set();

    for (const connection of record.connections) {
      const key = `${connection.type}-${connection.value}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      if (!connectionMap.has(key)) {
        connectionMap.set(key, {
          type: connection.type,
          value: connection.value,
          label: connection.label,
          metadata: connection.metadata || {},
          mediaIds: [],
        });
      }

      connectionMap.get(key).mediaIds.push(mediaNodeId);
    }
  }

  for (const connection of connectionMap.values()) {
    if (connection.mediaIds.length < 2) {
      continue;
    }

    const connectionId = getConnectionId(connection.type, connection.value);

    addNode(nodes, {
      id: connectionId,
      type: "connection",
      connectionType: connection.type,
      label: connection.label,
      count: connection.mediaIds.length,
      connectedMediaIds: connection.mediaIds,
      ...connection.metadata,
    });

    for (const mediaId of connection.mediaIds) {
      addEdge(edges, mediaId, connectionId);
    }
  }
}

function buildMediaRelationships(nodes, edges) {
  const connections = [...nodes.values()].filter(
    (node) => node.type === "connection",
  );

  const relationshipTypes = new Set(["actor", "director", "franchise"]);

  for (const connection of connections) {
    if (!relationshipTypes.has(connection.connectionType)) {
      continue;
    }

    const mediaIds = connection.connectedMediaIds;

    for (let i = 0; i < mediaIds.length; i += 1) {
      for (let j = i + 1; j < mediaIds.length; j += 1) {
        const source = mediaIds[i];
        const target = mediaIds[j];

        const id = `relationship-${connection.id}-${source}-${target}`;

        if (!edges.has(id)) {
          edges.set(id, {
            id,
            source,
            target,
            type: "relationship",
            relationshipType: connection.connectionType,
            relationshipLabel: connection.label,
          });
        }
      }
    }
  }
}

export function buildGraph(mediaRecords) {
  const nodes = new Map();
  const edges = new Map();

  for (const record of mediaRecords) {
    addNode(nodes, record.mediaNode);
  }

  buildSharedConnections(nodes, edges, mediaRecords);
  buildMediaRelationships(nodes, edges);

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}
