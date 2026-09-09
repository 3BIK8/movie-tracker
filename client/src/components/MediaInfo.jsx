/**
 * MediaInfo - Shows title, year, rating, genres, overview, and personal rating
 */
function MediaInfo({ details, status, rating, onRatingChange }) {
  return (
    <section className="details-main">
      <h2 title={details.title}>{details.title}</h2>

      <div className="details-meta">
        {details.date?.slice(0, 4)}
        {details.rating ? ` · ⭐ ${details.rating.toFixed(1)}` : ""}
      </div>

      {status === "watched" && (
        <div className="personal-rating">
          <span>My rating</span>

          <div className="rating-actions">
            {["S", "A", "B", "C", "D"].map((value) => (
              <button
                key={value}
                type="button"
                className={rating === value ? "selected" : ""}
                onClick={() => onRatingChange(value)}
                aria-label={`Rate ${value}`}
                aria-pressed={rating === value}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}

      {details.genres?.length > 0 && (
        <div className="genre-list">
          {details.genres.map((genre) => (
            <span key={genre}>{genre}</span>
          ))}
        </div>
      )}

      <p className="overview">
        {details.overview || "No description available."}
      </p>
    </section>
  );
}

export default MediaInfo;
