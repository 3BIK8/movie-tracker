import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWatchHistory } from "../hooks/useWatchHistory";
import { useConnectionSearch } from "./network/useConnectionSearch";
import { useNetworkGraph } from "./network/useNetworkGraph";
import ConnectionExplorer from "./network/ConnectionExplorer";
import NetworkMinimap from "./network/NetworkMinimap";
import NetworkDetailsPanel from "../components/network/NetworkDetailsPanel";
import {
  CONNECTION_TYPES,
  CONNECTION_LABELS,
} from "../constants/connectionTypes";

function NetworkView() {
  const { history } = useWatchHistory();
  const networkShellRef = useRef(null);
  const [showMetadata, setShowMetadata] = useState(true);
  const [titleSearch, setTitleSearch] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTypes, setActiveTypes] = useState(
    new Set(["actor", "director", "genre", "franchise", "decade"]),
  );
  const [focusedConnection, setFocusedConnection] = useState(null);

  const {
    containerRef,
    cyRef,
    networkData,
    selectedNode,
    loading,
    error,
    setSelectedNode,
    resetNetwork: resetGraph,
    fitGraph,
    zoomIn,
    zoomOut,
    focusNodeById,
    searchMedia,
  } = useNetworkGraph({
    history,
    activeTypes,
    focusedConnection,
    showMetadata,
    onConnectionFocus: setFocusedConnection,
  });

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === networkShellRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const { connectionSearch, setConnectionSearch, filteredConnections } =
    useConnectionSearch(networkData, activeTypes);

  const connectionNodes = useMemo(
    () => networkData?.nodes?.filter((node) => node.type === "connection") || [],
    [networkData],
  );

  const visibleConnectionCount = useMemo(
    () =>
      connectionNodes.filter((node) => showMetadata && activeTypes.has(node.connectionType))
        .length,
    [connectionNodes, activeTypes, showMetadata],
  );

  function toggleType(type) {
    setActiveTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);

      if (
        focusedConnection &&
        focusedConnection.connectionType === type &&
        !next.has(type)
      ) {
        setFocusedConnection(null);
      }

      return next;
    });
  }

  const focusConnection = useCallback(
    (connection) => {
      const connectedMedia = (connection.connectedMediaIds || [])
        .map((id) => networkData?.nodes?.find((node) => node.id === id))
        .filter(Boolean);

      setShowMetadata(true);
      setActiveTypes((current) => new Set(current).add(connection.connectionType));
      setFocusedConnection(connection);
      setConnectionSearch("");
      setSelectedNode({ node: connection, connectedMedia });
    },
    [networkData, setSelectedNode, setConnectionSearch],
  );

  function clearConnectionFocus() {
    setFocusedConnection(null);
    setSelectedNode(null);
  }

  function resetNetwork() {
    setFocusedConnection(null);
    setTitleSearch("");
    resetGraph();
  }

  function focusSelectedNode() {
    const nodeId = selectedNode?.node?.id;
    if (nodeId) focusNodeById(nodeId);
  }

  function handleTitleSearch(event) {
    event.preventDefault();
    const match = searchMedia(titleSearch);
    if (match) setTitleSearch(match.title || match.displayLabel || "");
  }

  async function toggleFullscreen() {
    const element = networkShellRef.current;
    if (!element) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await element.requestFullscreen();
    }

    requestAnimationFrame(() => cyRef.current?.resize());
    requestAnimationFrame(() => fitGraph(90));
  }

  const historyCount = Object.keys(history).length;
  const enrichedCount = networkData?.meta?.enrichedMedia ?? 0;
  const totalHistory = networkData?.meta?.totalHistory ?? historyCount;
  const shownTitles = networkData?.meta?.mediaNodeCount ?? enrichedCount;

  return (
    <section className={`network-page${isFullscreen ? " network-fullscreen" : ""}`}>
      <header className="network-header">
        <div>
          <h1>My Watch Network</h1>
          <p>
            {historyCount} titles in your watch history
            {networkData && (
              <>
                {" · "}showing {shownTitles} of {totalHistory}
                {" · "}{visibleConnectionCount} visible shared connections
              </>
            )}
          </p>
        </div>
        <button className="network-reset" onClick={resetNetwork}>Reset View</button>
      </header>

      <div className="network-layout">
        <aside className="network-controls">
          <h2>Network</h2>

          <div className="network-tool-group">
            <div className="network-tool-row">
              <button type="button" onClick={zoomOut} title="Zoom out" aria-label="Zoom out">−</button>
              <button type="button" onClick={() => fitGraph(90)} title="Fit graph" aria-label="Fit graph">⌂</button>
              <button type="button" onClick={zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
              <button type="button" onClick={focusSelectedNode} title="Focus selected node" aria-label="Focus selected node" disabled={!selectedNode?.node}>Focus</button>
            </div>
            <div className="network-tool-row">
              <button type="button" onClick={() => setShowMetadata((value) => !value)}>
                {showMetadata ? "Hide metadata" : "Show metadata"}
              </button>
              <button type="button" onClick={toggleFullscreen}>
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </button>
            </div>
          </div>

          <form className="network-title-search" onSubmit={handleTitleSearch}>
            <label htmlFor="network-title-search">Find title</label>
            <div>
              <input
                id="network-title-search"
                value={titleSearch}
                onChange={(event) => setTitleSearch(event.target.value)}
                placeholder="Search watched titles…"
              />
              <button type="submit">Find</button>
            </div>
          </form>

          <h2>Connections</h2>
          {CONNECTION_TYPES.map((connection) => (
            <label className="network-filter" key={connection.id}>
              <input
                type="checkbox"
                checked={showMetadata && activeTypes.has(connection.id)}
                onChange={() => toggleType(connection.id)}
                disabled={!showMetadata}
              />
              <span className={`network-color network-color-${connection.id}`} />
              {connection.label}
            </label>
          ))}

          <ConnectionExplorer
            connectionSearch={connectionSearch}
            setConnectionSearch={setConnectionSearch}
            filteredConnections={filteredConnections}
            focusedConnection={focusedConnection}
            onFocusConnection={focusConnection}
            onClearFocus={clearConnectionFocus}
          />

          <div className="network-help">
            <p>Click a node to inspect and highlight its neighborhood.</p>
            <p>Use Find title to center the graph on a watched title.</p>
            <p>Drag to pan and scroll to zoom. The minimap appears on larger graphs.</p>
          </div>
        </aside>

        <div ref={networkShellRef} className="network-container">
          <div className="network-toolbar">
            <button type="button" onClick={zoomOut} aria-label="Zoom out" title="Zoom out">−</button>
            <button type="button" onClick={zoomIn} aria-label="Zoom in" title="Zoom in">+</button>
            <button type="button" onClick={() => fitGraph(90)} aria-label="Fit graph" title="Fit graph">⌂</button>
            <button type="button" onClick={focusSelectedNode} aria-label="Focus selected node" title="Focus selected node" disabled={!selectedNode?.node}>◎</button>
            <button type="button" onClick={resetNetwork} aria-label="Reset network" title="Reset network">↻</button>
            <button type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen" title="Toggle fullscreen">⛶</button>
          </div>

          {loading && <div className="network-overlay">Building network...</div>}
          {error && <div className="network-overlay error">{error}</div>}
          {!historyCount && !loading && (
            <div className="network-overlay">Add some titles to your library first.</div>
          )}
          {historyCount > 0 && !loading && !error && networkData && !shownTitles && (
            <div className="network-overlay">No enriched titles are available for the network.</div>
          )}
          {focusedConnection && !loading && (
            <div className="network-focus-indicator">
              <span>Focused on</span>
              <strong>
                {CONNECTION_LABELS[focusedConnection.connectionType] || focusedConnection.connectionType}: {focusedConnection.label}
              </strong>
            </div>
          )}

          <div ref={containerRef} className="network-graph" />
          <NetworkMinimap cyRef={cyRef} />
        </div>

        <NetworkDetailsPanel
          node={selectedNode?.node}
          connectedMedia={selectedNode?.connectedMedia}
          onConnectionFocus={focusConnection}
        />
      </div>
    </section>
  );
}

export default NetworkView;
