import MediaDetails from "./MediaDetails";
import PersonDetails from "./PersonDetails";
import GenreDetails from "./GenreDetails";
import FranchiseDetails from "./FranchiseDetails";
import StudioDetails from "./StudioDetails";
import GenericConnectionDetails from "./GenericConnectionDetails";

function NetworkDetailsPanel({
  node,
  connectedMedia = [],
  onConnectionFocus,
}) {
  if (!node) {
    return (
      <aside className="network-details">
        <div className="network-details-empty">
          <div className="network-details-empty-icon">○</div>

          <h2>Selected Item</h2>

          <p>Hover or click a node in the network to see its details here.</p>
        </div>
      </aside>
    );
  }

  if (node.type === "media") {
    return (
      <aside className="network-details">
        <MediaDetails node={node} />
      </aside>
    );
  }

  let content;

  switch (node.connectionType) {
    case "actor":
    case "director":
      content = <PersonDetails node={node} connectedMedia={connectedMedia} />;
      break;

    case "genre":
      content = <GenreDetails node={node} connectedMedia={connectedMedia} />;
      break;

    case "franchise":
      content = (
        <FranchiseDetails node={node} connectedMedia={connectedMedia} />
      );
      break;

    case "studio":
      content = <StudioDetails node={node} connectedMedia={connectedMedia} />;
      break;

    default:
      content = (
        <GenericConnectionDetails node={node} connectedMedia={connectedMedia} />
      );
  }

  return (
    <aside className="network-details">
      {content}
      {onConnectionFocus && node.type === "connection" && (
        <button
          className="network-details-focus"
          onClick={() => onConnectionFocus(node)}
        >
          Focus this connection
        </button>
      )}
    </aside>
  );
}

export default NetworkDetailsPanel;
