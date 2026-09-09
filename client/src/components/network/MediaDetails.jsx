import { getTmdbImageUrl } from "../../constants/tmdb";

function MediaDetails({ node }) {
  const people = node.actors?.slice(0, 10) || [];
  const posterUrl = getTmdbImageUrl(node.poster_path, "w342");

  return (
    <>
      <div className="network-details-header">
        <span className="network-details-type">
          {node.mediaType === "movie" ? "MOVIE" : "TV SHOW"}
        </span>

        {node.status && (
          <span className={`network-status network-status-${node.status}`}>
            {node.status.replace("_", " ")}
          </span>
        )}
      </div>

      {posterUrl && (
        <img
          className="network-details-poster"
          src={posterUrl}
          alt={node.title}
        />
      )}

      <h2>{node.title}</h2>

      {node.year && <p className="network-details-year">{node.year}</p>}

      {node.rating !== null && node.rating !== undefined && (
        <div className="network-details-rating">★ {node.rating.toFixed(1)}</div>
      )}

      {node.genres?.length > 0 && (
        <div className="network-details-section">
          <h3>Genres</h3>

          <div className="network-tags">
            {node.genres.map((genre) => (
              <span key={genre.id}>{genre.name}</span>
            ))}
          </div>
        </div>
      )}

      {node.directors?.length > 0 && (
        <div className="network-details-section">
          <h3>{node.mediaType === "tv" ? "Creators" : "Director"}</h3>

          <div className="network-people-list">
            {node.directors.map((person) => {
              const imageUrl = getTmdbImageUrl(person.profile_path, "w92");

              return (
                <div className="network-small-person" key={person.id}>
                  {imageUrl ? (
                    <img src={imageUrl} alt={person.name} />
                  ) : (
                    <div className="network-small-person-placeholder">
                      {person.name?.charAt(0)}
                    </div>
                  )}

                  <span>{person.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {people.length > 0 && (
        <div className="network-details-section">
          <h3>Cast</h3>

          <div className="network-people-list">
            {people.map((person) => {
              const imageUrl = getTmdbImageUrl(person.profile_path, "w92");

              return (
                <div className="network-small-person" key={person.id}>
                  {imageUrl ? (
                    <img src={imageUrl} alt={person.name} />
                  ) : (
                    <div className="network-small-person-placeholder">
                      {person.name?.charAt(0)}
                    </div>
                  )}

                  <span>{person.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
