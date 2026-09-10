import { useMemo, useState } from "react";
import { useWatchHistory } from "../hooks/useWatchHistory";
import { useConnectionSearch } from "./network/useConnectionSearch";
import { useNetworkGraph } from "./network/useNetworkGraph";
import ConnectionExplorer from "./network/ConnectionExplorer";
import NetworkDetailsPanel from "../components/network/NetworkDetailsPanel";
import {
  CONNECTION_TYPES,
  CONNECTION_LABELS,
} from "../constants/connectionTypes";

function NetworkView() {
  const { history } = useWatchHistory();

  const [activeTypes, setActiveTypes] = useState(
    new Set(["actor", "director", "genre", "franchise", "decade"]),
  );

  const [focusedConnection, setFocusedConnection] = useState(null);

  const {
    containerRef,
    networkData,
    selectedNode,
    loading,
    error,
    setSelectedNode,
    resetNetwork: resetGraph,
  } = useNetworkGraph({
    history,
    activeTypes,
    focusedConnection,
  });

  const { connectionSearch, setConnectionSearch, filteredConnections } =
    useConnectionSearch(networkData, activeTypes);

  const mediaNodes = useMemo(
    () => networkData?.nodes?.filter((node) => node.type === "media") || [],
    [networkData],
  );

  const connectionNodes = useMemo(
    () =>
      networkData?.nodes?.filter((node) => node.type === "connection") || [],
    [networkData],
  );

  function toggleType(type) {
    setActiveTypes((current) => {
      const next = new Set(current);

      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }

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

  function focusConnection(connection) {
    const connectedMedia = (connection.connectedMediaIds || [])
      .map((id) => networkData?.nodes?.find((node) => node.id === id))
      .filter(Boolean);

    setFocusedConnection(connection);
    setConnectionSearch("");

    setSelectedNode({
      node: connection,
      connectedMedia,
    });
  }

  function clearConnectionFocus() {
    setFocusedConnection(null);
    setSelectedNode(null);
  }

  function resetNetwork() {
    setFocusedConnection(null);
    resetGraph();
  }

  const historyCount = Object.keys(history).length;
  const visibleFocusedConnection = historyCount ? focusedConnection : null;
  const enrichedCount = networkData?.meta?.enrichedMedia ?? 0;
  const connectionCount = connectionNodes.length;

  return (
    <section className="network-page">
      <header className="network-header">
        <div>
          <h1>My Watch Network</h1>

          <p>
            {historyCount} titles in your watch history
            {networkData && (
              <>
                {" · "}
                {enrichedCount} enriched
                {" · "}
                {connectionCount} shared connections
              </>
            )}
          </p>
        </div>

        <button className="network-reset" onClick={resetNetwork}>
          Reset View
        </button>
      </header>

      <div className="network-layout">
        <aside className="network-controls">
          <h2>Connections</h2>

          {CONNECTION_TYPES.map((connection) => (
            <label className="network-filter" key={connection.id}>
              <input
                type="checkbox"
                checked={activeTypes.has(connection.id)}
                onChange={() => toggleType(connection.id)}
              />

              <span
                className={`network-color network-color-${connection.id}`}
              />

              {connection.label}
            </label>
          ))}

          <ConnectionExplorer
            connectionSearch={connectionSearch}
            setConnectionSearch={setConnectionSearch}
            filteredConnections={filteredConnections}
            focusedConnection={visibleFocusedConnection}
            onFocusConnection={focusConnection}
            onClearFocus={clearConnectionFocus}
          />

          <div className="network-help">
            <p>
              The graph shows titles linked through connections shared by at
              least two titles.
            </p>

            <p>Hover a node to highlight its relationships.</p>

            <p>Click a connection to inspect the titles behind it.</p>

            <p>Filters and focus are local and do not rebuild the network.</p>
          </div>
        </aside>

        <div className="network-container">
          {loading && (
            <div className="network-overlay">Building network...</div>
          )}

          {error && <div className="network-overlay error">{error}</div>}

          {!historyCount && !loading && (
            <div className="network-overlay">
              Add some titles to your library first.
            </div>
          )}

          {historyCount > 0 && !loading && !error && networkData && !connectionCount && (
            <div className="network-overlay">
              No shared connections match the current filters.
            </div>
          )}

          {visibleFocusedConnection && !loading && (
            <div className="network-focus-indicator">
              <span>Focused on</span>

              <strong>
                {CONNECTION_LABELS[visibleFocusedConnection.connectionType] ||
                  visibleFocusedConnection.connectionType}
                : {visibleFocusedConnection.label}
              </strong>
            </div>
          )}

          <div ref={containerRef} className="network-graph" />
        </div>

        <NetworkDetailsPanel
          node={selectedNode?.node}
          connectedMedia={selectedNode?.connectedMedia}
        />
      </div>
    </section>
  );
}

export default NetworkView;
