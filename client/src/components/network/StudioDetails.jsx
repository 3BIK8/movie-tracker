import { getTmdbImageUrl } from "../../constants/tmdb";
import MediaList from "./MediaList";

function StudioDetails({ node, connectedMedia }) {
  const count = connectedMedia?.length || 0;
  const logoUrl = getTmdbImageUrl(node.logo_path, "w154");

  return (
    <>
      <div className="network-connection-heading">
        {logoUrl ? (
          <div className="network-studio-logo">
            <img src={logoUrl} alt={node.label} />
          </div>
        ) : (
          <span
            className={`network-large-color network-color-${node.connectionType}`}
          />
        )}

        <div>
          <span className="network-details-type">STUDIO</span>

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

export default StudioDetails;
