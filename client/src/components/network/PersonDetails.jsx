import { getTmdbImageUrl } from "../../constants/tmdb";
import { CONNECTION_LABELS } from "../../constants/connectionTypes";
import MediaList from "./MediaList";

function PersonDetails({ node, connectedMedia }) {
  const count = connectedMedia?.length || 0;
  const imageUrl = getTmdbImageUrl(node.profile_path, "w185");

  return (
    <>
      <div className="network-person">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={node.label}
            className="network-person-image"
          />
        ) : (
          <div className="network-person-placeholder">
            <span>{node.label?.charAt(0)}</span>
          </div>
        )}

        <div className="network-person-info">
          <span className="network-details-type">
            {CONNECTION_LABELS[node.connectionType] || node.connectionType}
          </span>

          <h2>{node.label}</h2>

          <p>
            {count} connected {count === 1 ? "title" : "titles"}
          </p>
        </div>
      </div>

      <div className="network-details-section network-connected-section">
        <h3>Connected Titles</h3>

        <MediaList media={connectedMedia} />
      </div>
    </>
  );
}

export default PersonDetails;
