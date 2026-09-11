function clearGraphState(cy) {
  cy.elements()
    .removeClass("dimmed")
    .removeClass("highlighted")
    .removeClass("show-label");
}

function getConnectedMedia(cy, node) {
  if (node.data("type") === "media") {
    const mediaIds = new Set([node.id()]);

    node.connectedEdges().forEach((edge) => {
      edge.connectedNodes().forEach((connectedNode) => {
        if (connectedNode.data("type") !== "connection") {
          return;
        }

        connectedNode.connectedEdges().forEach((connectionEdge) => {
          connectionEdge.connectedNodes().forEach((mediaNode) => {
            if (mediaNode.data("type") === "media") {
              mediaIds.add(mediaNode.id());
            }
          });
        });
      });
    });

    return mediaIds;
  }

  return new Set(node.data("connectedMediaIds") || []);
}

function highlightNodeNeighborhood(cy, node) {
  clearGraphState(cy);

  const connectedMediaIds = getConnectedMedia(cy, node);
  const visibleNodes = cy.nodes().filter((candidate) => {
    if (candidate.id() === node.id()) {
      return true;
    }

    if (candidate.data("type") === "media") {
      return connectedMediaIds.has(candidate.id());
    }

    return candidate.connectedEdges().some((edge) =>
      edge.connectedNodes().some((connectedNode) =>
        connectedMediaIds.has(connectedNode.id()),
      ),
    );
  });

  cy.nodes().addClass("dimmed");
  cy.edges().addClass("dimmed");

  visibleNodes.removeClass("dimmed").addClass("highlighted");
  visibleNodes.connectedEdges().removeClass("dimmed").addClass("highlighted");
  visibleNodes.addClass("show-label");
  node.removeClass("dimmed").addClass("highlighted").addClass("show-label");
}

function showNodeDetails(cy, node, networkDataRef, setSelectedNode) {
  const nodeData = node.data();

  highlightNodeNeighborhood(cy, node);

  if (nodeData.type === "media") {
    setSelectedNode({
      node: nodeData,
      connectedMedia: [],
    });

    return;
  }

  const allNodes = networkDataRef.current?.nodes || [];
  const mediaById = new Map(
    allNodes
      .filter((item) => item.type === "media")
      .map((item) => [item.id, item]),
  );

  const connectedMedia = (nodeData.connectedMediaIds || [])
    .map((id) => mediaById.get(id))
    .filter(Boolean);

  setSelectedNode({
    node: nodeData,
    connectedMedia,
  });
}

export function attachGraphEventListeners(
  cy,
  { networkDataRef, setSelectedNode, focusedConnection, onConnectionFocus },
) {
  function handleMouseOver(event) {
    showNodeDetails(cy, event.target, networkDataRef, setSelectedNode);
  }

  function handleMouseOut() {
    if (!focusedConnection) {
      clearGraphState(cy);
    }
  }

  function handleNodeTap(event) {
    showNodeDetails(cy, event.target, networkDataRef, setSelectedNode);
  }

  function handleNodeDoubleTap(event) {
    const node = event.target;
    const nodeData = node.data();

    if (nodeData.type === "connection") {
      onConnectionFocus?.(nodeData);
      return;
    }

    highlightNodeNeighborhood(cy, node);
  }

  function handleBackgroundTap(event) {
    if (event.target === cy) {
      clearGraphState(cy);
      setSelectedNode(null);
    }
  }

  cy.on("mouseover", "node", handleMouseOver);
  cy.on("mouseout", "node", handleMouseOut);
  cy.on("tap", "node", handleNodeTap);
  cy.on("dbltap", "node", handleNodeDoubleTap);
  cy.on("tap", handleBackgroundTap);

  return () => {
    cy.removeListener("mouseover", "node", handleMouseOver);
    cy.removeListener("mouseout", "node", handleMouseOut);
    cy.removeListener("tap", "node", handleNodeTap);
    cy.removeListener("dbltap", "node", handleNodeDoubleTap);
    cy.removeListener("tap", handleBackgroundTap);
  };
}
