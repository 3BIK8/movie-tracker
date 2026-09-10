import { useCallback, useEffect, useState } from "react";
import MovieCard from "../components/MovieCard";
import Pagination from "../components/Pagination";
import { getRecommendations } from "../services/api";
import { getWatchHistory, WATCH_HISTORY_UPDATED } from "../services/watchlist";
import {
  finalizeIgnoredRecommendations,
  getRecommendationFeedback,
  recordRecommendationInteraction,
  recordRecommendationsShown,
  recordRecommendationsSkipped,
} from "../services/recommendationFeedback";

const PAGE_SIZE = 20;

function RecommendationsView() {
  const [recommendations, setRecommendations] = useState({
    movies: [],
    tv: [],
  });

  const [activeType, setActiveType] = useState("movie");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  const [expandedId, setExpandedId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadRecommendations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      finalizeIgnoredRecommendations();

      const history = Object.values(getWatchHistory());
      const feedback = getRecommendationFeedback();
      const result = await getRecommendations(history, feedback);
      const nextRecommendations = result.recommendations || {
        movies: [],
        tv: [],
      };

      setRecommendations(nextRecommendations);
      recordRecommendationsShown([
        ...(nextRecommendations.movies || []),
        ...(nextRecommendations.tv || []),
      ]);

      setPage(1);
      setPageInput("1");
      setExpandedId(null);
    } catch (error) {
      console.error(error);
      setError(error.message || "Unable to generate recommendations.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // The effect intentionally starts an asynchronous external-system request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecommendations();
  }, [loadRecommendations]);

  useEffect(() => {
    const handleHistoryUpdate = () => {
      setExpandedId(null);
    };

    window.addEventListener(WATCH_HISTORY_UPDATED, handleHistoryUpdate);

    return () => {
      window.removeEventListener(WATCH_HISTORY_UPDATED, handleHistoryUpdate);
    };
  }, []);

  const recommendationKey = activeType === "movie" ? "movies" : "tv";
  const items = recommendations[recommendationKey] || [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const visibleItems = items.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function changeType(type) {
    recordRecommendationsSkipped(visibleItems);
    setActiveType(type);
    setPage(1);
    setPageInput("1");
    setExpandedId(null);
  }

  function changePage(newPage) {
    recordRecommendationsSkipped(visibleItems);

    const target = Math.min(Math.max(newPage, 1), totalPages);

    setPage(target);
    setPageInput(String(target));
    setExpandedId(null);
  }

  function handlePageInputChange(value) {
    setPageInput(value);
  }

  function handleExpand(id) {
    const isOpening = expandedId !== id;

    setExpandedId((current) => (current === id ? null : id));

    if (isOpening) {
      const separatorIndex = id.indexOf("-");
      const type = id.slice(0, separatorIndex);
      const mediaId = id.slice(separatorIndex + 1);
      recordRecommendationInteraction(type, mediaId, "opened");
    }
  }

  return (
    <section className="recommendations-view">
      <header className="recommendations-header">
        <div>
          <h1>Recommendations</h1>
          <p>Recommendations based on what you have watched and rated.</p>
        </div>

        <button
          type="button"
          onClick={loadRecommendations}
          disabled={isLoading}
        >
          {isLoading ? "Analyzing…" : "Refresh"}
        </button>
      </header>

      <div className="recommendation-controls">
        <button
          type="button"
          className={activeType === "movie" ? "active" : ""}
          onClick={() => changeType("movie")}
        >
          Movies
        </button>

        <button
          type="button"
          className={activeType === "tv" ? "active" : ""}
          onClick={() => changeType("tv")}
        >
          Series
        </button>
      </div>

      {error && <div className="recommendations-error">{error}</div>}

      {isLoading && (
        <div className="recommendations-loading">
          Generating recommendations…
        </div>
      )}

      {!isLoading && !error && visibleItems.length === 0 && (
        <div className="recommendations-empty">
          <p>No recommendations yet.</p>
          <p>
            Watch and rate more movies or series to give the system more
            information.
          </p>
        </div>
      )}

      {!isLoading && visibleItems.length > 0 && (
        <>
          <div className="movie-grid">
            {visibleItems.map((item) => (
              <MovieCard
                key={`${activeType}-${item.id}`}
                item={item}
                type={activeType}
                isExpanded={expandedId === `${activeType}-${item.id}`}
                onExpand={handleExpand}
              />
            ))}
          </div>

          <Pagination
            page={currentPage}
            pageInput={pageInput}
            totalPages={totalPages}
            onPageChange={changePage}
            onPageInputChange={handlePageInputChange}
          />
        </>
      )}
    </section>
  );
}

export default RecommendationsView;
