import { CONNECTION_LABELS } from "../../constants/connectionTypes";
import MediaList from "./MediaList";

function GenericConnectionDetails({ node, connectedMedia }) {
  const count = connectedMedia?.length || 0;

  return (
    <>
      <div className="network-connection-heading">
        <span
          className={`network-large-color network-color-${node.connectionType}`}
        />

        <div>
          <span className="network-details-type">
            {CONNECTION_LABELS[node.connectionType] || node.connectionType}
          </span>

          <h2>{node.label}</h2>
        </div>
      </div>

      <div className="network-stat">
        <span className="network-stat-value">{count}</span>

        <span className="network-stat-label">
          connected {count === 1 ? "title" : "titles"}
        </span>
      </div>

      <div className="network-details-section network-connected-section">
        <h3>Connected Titles</h3>

        <MediaList media={connectedMedia} />
      </div>
    </>
  );
}

export default GenericConnectionDetails;
