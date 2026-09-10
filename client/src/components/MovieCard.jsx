import { useCallback, useState } from "react";
import MoviePoster from "./MoviePoster";
import ExpandedCard from "./ExpandedCard";
import { useMediaDetails } from "../hooks/useMediaDetails";
import { useWatchStatus } from "../hooks/useWatchStatus";
import { useWatchFavorite } from "../hooks/useWatchFavorite";

/** A fixed-size grid item whose expanded content is rendered outside the grid. */
function MovieCard({ item, type, onExpand, isExpanded, onPersonClick }) {
  const { details, error, isLoading } = useMediaDetails(
    type,
    item.id,
    isExpanded,
  );

  const { status, setStatus } = useWatchStatus(item, type, details);
  const { favorite, toggleFavorite } = useWatchFavorite(item, type, details);

  const [anchor, setAnchor] = useState(null);

  const setPosterRef = useCallback((node) => {
    setAnchor(node);
  }, []);

  const handleExpand = () => {
    onExpand(`${type}-${item.id}`);
  };

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
  };

  return (
    <article className="movie-card">
      <MoviePoster
        ref={setPosterRef}
        item={item}
        type={type}
        status={status}
        favorite={favorite}
        isExpanded={isExpanded}
        onClick={handleExpand}
        onStatusChange={handleStatusChange}
        onFavoriteChange={toggleFavorite}
      />

      <ExpandedCard
        anchor={anchor}
        isOpen={isExpanded}
        item={item}
        type={type}
        status={status}
        details={details}
        error={error}
        isLoading={isLoading}
        onClose={() => onExpand(`${type}-${item.id}`)}
        onPersonClick={onPersonClick}
      />
    </article>
  );
}

export default MovieCard;
