import { getTmdbImageUrl } from "../../constants/tmdb";

function MediaDetails({ node }) {
  const posterUrl = getTmdbImageUrl(node.poster_path, "w342");

  return (
    <>
      {posterUrl && (
        <img
          className="network-details-poster"
          src={posterUrl}
          alt={node.title}
        />
      )}

      <h2>{node.title}</h2>

      {node.year && <p className="network-details-year">{node.year}</p>}

      {node.overview && (
        <div className="network-details-section">
          <h3>Overview</h3>
          <p className="network-overview">{node.overview}</p>
        </div>
      )}
    </>
  );
}

export default MediaDetails;
