import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { getWatchHistoryNetwork } from "../../services/api";
import { NETWORK_STYLES } from "./networkStyles";
import { filterGraphElements } from "./filterGraphElements";
import { attachGraphEventListeners } from "./cytoscapeEvents";
export function useNetworkGraph({ history, activeTypes, focusedConnection }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const networkDataRef = useRef(null);

  const [networkData, setNetworkData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const historyItems = Object.values(history);

    if (!historyItems.length) {
      cyRef.current?.destroy();
      cyRef.current = null;
      networkDataRef.current = null;
      setNetworkData(null);

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

        if (cancelled || !containerRef.current) {
          return;
        }

        networkDataRef.current = data;
        setNetworkData(data);

        cyRef.current?.destroy();

        const { nodes: filteredNodes, edges: filteredEdges } =
          filterGraphElements(data, activeTypes, focusedConnection);

        const elements = [
          ...filteredNodes.map((node) => ({
            data: node,
          })),
          ...filteredEdges.map((edge) => ({
            data: edge,
          })),
        ];

        const cy = cytoscape({
          container: containerRef.current,
          elements,

          layout: {
            name: "cose",
            animate: true,
            animationDuration: 700,
            fit: true,
            padding: 80,

            nodeRepulsion: 16000,
            idealEdgeLength: focusedConnection ? 110 : 85,
            edgeElasticity: 140,
            nestingFactor: 1.2,
            gravity: 1.5,
            gravityRange: 3.5,
          },

          minZoom: 0.2,
          maxZoom: 4,

          style: NETWORK_STYLES,
        });
        const detachGraphEventListeners = attachGraphEventListeners(cy, {
          networkDataRef,
          setSelectedNode,
          focusedConnection,
        });
        cy.on("destroy", detachGraphEventListeners);
        cyRef.current = cy;
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

      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [history, activeTypes, focusedConnection]);

  function resetNetwork() {
    setSelectedNode(null);

    cyRef.current
      ?.elements()
      .removeClass("dimmed")
      .removeClass("highlighted")
      .removeClass("show-label");

    cyRef.current?.fit(undefined, 80);
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
