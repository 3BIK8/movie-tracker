import { forwardRef } from "react";
import WatchActions from "./WatchActions";
import { getTmdbImageUrl } from "../constants/tmdb";

/**
 * MoviePoster - Fixed-size poster image with watch actions.
 * Uses lazy loading and appropriately sized TMDB images
 * to reduce bandwidth without changing the UI.
 */
const MoviePoster = forwardRef(function MoviePoster(
  { item, type, status, isExpanded, onClick, onStatusChange },
  ref,
) {
  const title = type === "movie" ? item.title : item.name;
  const imageUrl = getTmdbImageUrl(item.poster_path);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={ref}
      className="movie-poster"
      role="button"
      tabIndex={0}
      aria-label={`Show details for ${title || "this title"}`}
      aria-expanded={isExpanded}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <div className="poster-container">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" decoding="async" />
        ) : (
          <div className="no-poster">No Poster</div>
        )}

        <WatchActions status={status} onStatusChange={onStatusChange} />
      </div>
    </div>
  );
});

export default MoviePoster;
