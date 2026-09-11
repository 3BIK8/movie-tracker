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

    const projection = filterGraphElements(
      networkData,
      activeTypes,
      focusedConnection,
    );

    pendingFitRef.current = null;
    layoutActiveRef.current = true;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...projection.nodes.map((node) => ({ data: node })),
        ...projection.edges.map((edge) => ({ data: edge })),
      ],

      layout: {
        name: "cose",
        animate: false,
        fit: true,
        padding: 100,
        nodeRepulsion: 28000,
        idealEdgeLength: 130,
        edgeElasticity: 120,
        nestingFactor: 1.1,
        gravity: 0.7,
        gravityRange: 3,
      },

      minZoom: 0.15,
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
  }, [networkData, activeTypes, focusedConnection, onConnectionFocus]);

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

      cy.fit(cy.nodes(), 100);
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
