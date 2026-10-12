import { forwardRef } from "react";
import WatchActions from "./WatchActions";
import { getTmdbImageUrl } from "../constants/tmdb";

/**
 * MoviePoster - Fixed-size poster image with watch actions.
 * Uses lazy loading and appropriately sized TMDB images
 * to reduce bandwidth without changing the UI.
 */
const MoviePoster = forwardRef(function MoviePoster(
  {
    item,
    type,
    status,
    favorite,
    isExpanded,
    onClick,
    onStatusChange,
    onFavoriteChange,
  },
  ref,
) {
  const title = type === "movie" ? item.title : item.name;
  const imageUrl = getTmdbImageUrl(item.poster_path);

  return (
    <div
      ref={ref}
      className="movie-poster"
    >
      <div className="poster-container">
        <button
          type="button"
          className="poster-details-trigger"
          onClick={onClick}
          aria-label={`Show details for ${title || "this title"}`}
          aria-expanded={isExpanded}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="no-poster">No Poster</span>
          )}
        </button>

        <WatchActions
          status={status}
          favorite={favorite}
          onStatusChange={onStatusChange}
          onFavoriteChange={onFavoriteChange}
        />
      </div>
    </div>
  );
});

export default MoviePoster;
