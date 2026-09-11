import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { getWatchHistoryNetwork } from "../../services/api";
import { NETWORK_STYLES } from "./networkStyles";
import { filterGraphElements } from "./filterGraphElements";
import { attachGraphEventListeners } from "./cytoscapeEvents";

export function useNetworkGraph({
  history,
  activeTypes,
  focusedConnection,
  onConnectionFocus,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const networkDataRef = useRef(null);
  const layoutActiveRef = useRef(false);
  const pendingFitRef = useRef(null);

  const [networkData, setNetworkData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const historyItems = Object.values(history);

    if (!historyItems.length) {
      networkDataRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNetworkData(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedNode(null);

      return;
    }

    let cancelled = false;

    async function loadNetwork() {
      try {
        setLoading(true);
        setError("");
        setSelectedNode(null);

        const data = await getWatchHistoryNetwork(historyItems);

        if (cancelled) {
          return;
        }

        networkDataRef.current = data;
        setNetworkData(data);
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setError(err.message || "Unable to build watch-history network.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadNetwork();

    return () => {
      cancelled = true;
    };
  }, [history]);

  useEffect(() => {
    if (!networkData || !containerRef.current) {
      return undefined;
    }

    const previousCy = cyRef.current;
    if (previousCy) {
      previousCy.stop();
      previousCy.destroy();
    }

    pendingFitRef.current = null;
    layoutActiveRef.current = true;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...networkData.nodes.map((node) => ({ data: node })),
        ...networkData.edges.map((edge) => ({ data: edge })),
      ],

      layout: {
        name: "cose",
        animate: true,
        animationDuration: 700,
        fit: true,
        padding: 80,
        nodeRepulsion: 16000,
        idealEdgeLength: 85,
        edgeElasticity: 140,
        nestingFactor: 1.2,
        gravity: 1.5,
        gravityRange: 3.5,
      },

      minZoom: 0.2,
      maxZoom: 4,
      style: NETWORK_STYLES,
    });

    cy.one("layoutstop", () => {
      if (cyRef.current !== cy) {
        return;
      }

      layoutActiveRef.current = false;

      const pendingFit = pendingFitRef.current;
      pendingFitRef.current = null;

      pendingFit?.();
    });

    const detachGraphEventListeners = attachGraphEventListeners(cy, {
      networkDataRef,
      setSelectedNode,
      focusedConnection: null,
      onConnectionFocus,
    });
    cy.on("destroy", detachGraphEventListeners);
    cyRef.current = cy;

    return () => {
      if (cyRef.current === cy) {
        pendingFitRef.current = null;
        layoutActiveRef.current = false;
      }

      cy.stop();
      cy.destroy();

      if (cyRef.current === cy) {
        cyRef.current = null;
      }
    };
  }, [networkData, onConnectionFocus]);

  useEffect(() => {
    if (!networkData || !cyRef.current) {
      return;
    }

    const cy = cyRef.current;
    const { nodes: filteredNodes } = filterGraphElements(
      networkData,
      activeTypes,
      focusedConnection,
    );
    const visibleIds = new Set(filteredNodes.map((node) => node.id));

    cy.nodes().forEach((node) => {
      node.toggleClass("dimmed", !visibleIds.has(node.id()));
      node.toggleClass("filtered-out", !visibleIds.has(node.id()));
    });

    cy.edges().forEach((edge) => {
      const visible =
        visibleIds.has(edge.data("source")) &&
        visibleIds.has(edge.data("target"));

      edge.toggleClass("filtered-out", !visible);
    });

    const fitVisibleNodes = () => {
      if (cyRef.current !== cy) {
        return;
      }

      // Fit only nodes. Asking Cytoscape to calculate an edge-inclusive
      // bounding box while visibility classes are changing can force edge
      // projection recalculation during a render transition.
      const visibleNodes = cy.nodes().filter((node) =>
        visibleIds.has(node.id()),
      );

      if (visibleNodes.length) {
        cy.fit(visibleNodes, 80);
      }
    };

    if (layoutActiveRef.current) {
      pendingFitRef.current = fitVisibleNodes;
    } else {
      fitVisibleNodes();
    }
  }, [networkData, activeTypes, focusedConnection]);

  function resetNetwork() {
    setSelectedNode(null);

    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    cy.elements()
      .removeClass("dimmed")
      .removeClass("highlighted")
      .removeClass("show-label")
      .removeClass("filtered-out");

    const fitAllNodes = () => {
      if (cyRef.current !== cy) {
        return;
      }

      cy.fit(cy.nodes(), 80);
    };

    if (layoutActiveRef.current) {
      pendingFitRef.current = fitAllNodes;
    } else {
      fitAllNodes();
    }
  }

  return {
    containerRef,
    cyRef,
    networkData,
    selectedNode,
    loading,
    error,
    setSelectedNode,
    resetNetwork,
  };
}
