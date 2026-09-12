export function filterGraphElements(
  networkData,
  activeTypes,
  focusedConnection,
  showMetadata = true,
) {
  if (!networkData?.nodes) {
    return { nodes: [], edges: [] };
  }

  let filteredNodes = networkData.nodes.filter((node) => {
    if (node.type === "media") return true;
    return showMetadata && activeTypes.has(node.connectionType);
  });

  if (focusedConnection) {
    const connection = networkData.nodes.find(
      (node) => node.id === focusedConnection.id,
    );

    if (connection) {
      const connectedMediaIds = new Set(connection.connectedMediaIds || []);
      filteredNodes = networkData.nodes.filter((node) => {
        if (node.id === connection.id) return showMetadata;
        return node.type === "media" && connectedMediaIds.has(node.id);
      });
    }
  }

  const visibleIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = networkData.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}
