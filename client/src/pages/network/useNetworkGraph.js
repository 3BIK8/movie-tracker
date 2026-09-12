import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { getWatchHistoryNetwork } from "../../services/api";
import { NETWORK_STYLES } from "./networkStyles";
import { filterGraphElements } from "./filterGraphElements";
import {
  buildEdgeCurveDistance,
  buildStructuredNetworkLayout,
} from "./structuredNetworkLayout";
import { attachGraphEventListeners } from "./cytoscapeEvents";

const STRUCTURED_NETWORK_LAYOUT = {
  name: "preset",
  fit: true,
  padding: 70,
};

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

        if (cancelled) return;

        networkDataRef.current = data;
        setNetworkData(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(err.message || "Unable to build watch-history network.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadNetwork();

    return () => {
      cancelled = true;
    };
  }, [history]);

  useEffect(() => {
    if (!networkData || !containerRef.current) return undefined;

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
    const positions = buildStructuredNetworkLayout(projection.nodes);
    const mediaPositions = projection.nodes
      .filter((node) => node.type === "media")
      .map((node) => positions[node.id])
      .filter(Boolean);
    const center = mediaPositions.reduce(
      (point, position) => ({
        x: point.x + position.x / Math.max(mediaPositions.length, 1),
        y: point.y + position.y / Math.max(mediaPositions.length, 1),
      }),
      { x: 0, y: 0 },
    );

    pendingFitRef.current = null;
    layoutActiveRef.current = true;

    const elements = [
      ...projection.nodes.map((node) => ({
        data: node,
        position: positions[node.id],
      })),
      ...projection.edges.map((edge) => {
        const source = positions[edge.source];
        const target = positions[edge.target];
        return {
          data: {
            ...edge,
            curveDistance:
              source && target
                ? buildEdgeCurveDistance(source, target, center)
                : 0,
          },
        };
      }),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      layout: STRUCTURED_NETWORK_LAYOUT,
      minZoom: 0.12,
      maxZoom: 4,
      style: NETWORK_STYLES,
    });

    cy.one("layoutstop", () => {
      if (cyRef.current !== cy) return;

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

      if (cyRef.current === cy) cyRef.current = null;
    };
  }, [networkData, activeTypes, focusedConnection, onConnectionFocus]);

  function resetNetwork() {
    setSelectedNode(null);

    const cy = cyRef.current;
    if (!cy) return;

    cy.elements()
      .removeClass("dimmed")
      .removeClass("highlighted")
      .removeClass("show-label")
      .removeClass("filtered-out");

    const fitAllNodes = () => {
      if (cyRef.current !== cy) return;
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
