function clearGraphState(cy) {
  cy.elements()
    .removeClass("dimmed")
    .removeClass("highlighted")
    .removeClass("show-label");
}

function showNodeDetails(cy, node, networkDataRef, setSelectedNode) {
  const nodeData = node.data();

  clearGraphState(cy);

  node.addClass("highlighted");
  node.addClass("show-label");

  node.connectedEdges().removeClass("dimmed").addClass("highlighted");

  node
    .connectedEdges()
    .connectedNodes()
    .removeClass("dimmed")
    .addClass("highlighted")
    .addClass("show-label");

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
  { networkDataRef, setSelectedNode, focusedConnection },
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

  function handleBackgroundTap(event) {
    if (event.target === cy) {
      clearGraphState(cy);
      setSelectedNode(null);
    }
  }

  cy.on("mouseover", "node", handleMouseOver);
  cy.on("mouseout", "node", handleMouseOut);
  cy.on("tap", "node", handleNodeTap);
  cy.on("tap", handleBackgroundTap);

  return () => {
    cy.removeListener("mouseover", "node", handleMouseOver);
    cy.removeListener("mouseout", "node", handleMouseOut);
    cy.removeListener("tap", "node", handleNodeTap);
    cy.removeListener("tap", handleBackgroundTap);
  };
}
