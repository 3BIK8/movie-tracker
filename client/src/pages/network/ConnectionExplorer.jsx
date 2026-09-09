function ConnectionExplorer({
  connectionSearch,
  setConnectionSearch,
  filteredConnections,
  focusedConnection,
  onFocusConnection,
  onClearFocus,
}) {
  return (
    <div className="network-explorer">
      <h3>Explore connections</h3>

      <input
        type="search"
        value={connectionSearch}
        onChange={(event) => setConnectionSearch(event.target.value)}
        placeholder="Search..."
        aria-label="Search connections"
      />

      {focusedConnection && (
        <button className="network-clear-focus" onClick={onClearFocus}>
          Clear focus
        </button>
      )}

      <div className="network-connection-results">
        {filteredConnections.length === 0 ? (
          <p className="network-no-results">No shared connections found.</p>
        ) : (
          filteredConnections.map((connection) => (
            <button
              key={connection.id}
              className={`network-connection-option ${
                focusedConnection?.id === connection.id ? "active" : ""
              }`}
              onClick={() => onFocusConnection(connection)}
            >
              <span className="network-connection-option-main">
                <span
                  className={`network-color network-color-${connection.connectionType}`}
                />

                <span className="network-connection-name">
                  {connection.label}
                </span>
              </span>

              <span className="network-connection-count">
                {connection.count}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default ConnectionExplorer;
