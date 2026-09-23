import { useCallback, useEffect, useRef, useState } from "react";
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
import { filterDisplayedRecommendations } from "../services/recommendationDisplayFilter";

const PAGE_SIZE = 20;

function RecommendationsView({ onPersonClick }) {
  const [recommendations, setRecommendations] = useState({ movies: [], tv: [] });
  const [activeType, setActiveType] = useState("movie");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [expandedId, setExpandedId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestSequence = useRef(0);
  const activeTypeRef = useRef("movie");

  useEffect(() => {
    activeTypeRef.current = activeType;
  }, [activeType]);

  const loadRecommendations = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setIsLoading(true);
    setError(null);

    try {
      finalizeIgnoredRecommendations();
      const history = Object.values(getWatchHistory());
      const feedback = getRecommendationFeedback();
      const result = await getRecommendations(history, feedback);
      if (requestId !== requestSequence.current) return;

      const nextRecommendations = result.recommendations || { movies: [], tv: [] };
      const latestHistory = Object.values(getWatchHistory());
      const filteredRecommendations = {
        movies: filterDisplayedRecommendations(nextRecommendations.movies, latestHistory),
        tv: filterDisplayedRecommendations(nextRecommendations.tv, latestHistory),
      };

      setRecommendations(filteredRecommendations);
      setPage(1);
      setPageInput("1");
      setExpandedId(null);

      const visibleType = activeTypeRef.current === "movie" ? "movies" : "tv";
      recordRecommendationsShown(filteredRecommendations[visibleType].slice(0, PAGE_SIZE));
    } catch (requestError) {
      if (requestId !== requestSequence.current) return;
      console.error(requestError);
      setError(requestError.message || "Unable to generate recommendations.");
    } finally {
      if (requestId === requestSequence.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // This effect intentionally starts an external data request that updates view state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecommendations();
  }, [loadRecommendations]);

  useEffect(() => {
    const handleHistoryUpdate = () => {
      const latestHistory = Object.values(getWatchHistory());
      setRecommendations((current) => ({
        movies: filterDisplayedRecommendations(current.movies, latestHistory),
        tv: filterDisplayedRecommendations(current.tv, latestHistory),
      }));
    };

    window.addEventListener(WATCH_HISTORY_UPDATED, handleHistoryUpdate);
    return () => window.removeEventListener(WATCH_HISTORY_UPDATED, handleHistoryUpdate);
  }, []);

  const recommendationKey = activeType === "movie" ? "movies" : "tv";
  const items = recommendations[recommendationKey] || [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function changeType(type) {
    recordRecommendationsSkipped(visibleItems);
    setActiveType(type);
    setPage(1);
    setPageInput("1");
    setExpandedId(null);
    const nextKey = type === "movie" ? "movies" : "tv";
    recordRecommendationsShown((recommendations[nextKey] || []).slice(0, PAGE_SIZE));
  }

  function changePage(newPage) {
    recordRecommendationsSkipped(visibleItems);
    const target = Math.min(Math.max(newPage, 1), totalPages);
    setPage(target);
    setPageInput(String(target));
    setExpandedId(null);
    const targetItems = items.slice((target - 1) * PAGE_SIZE, target * PAGE_SIZE);
    recordRecommendationsShown(targetItems);
  }

  function handleExpand(id) {
    const isOpening = expandedId !== id;
    setExpandedId((current) => (current === id ? null : id));
    if (isOpening) {
      const separatorIndex = id.indexOf("-");
      recordRecommendationInteraction(
        id.slice(0, separatorIndex),
        id.slice(separatorIndex + 1),
        "opened",
      );
    }
  }

  function handleNotInterested(item) {
    recordRecommendationInteraction(activeType, item.id, "not_interested");
    setRecommendations((current) => ({
      ...current,
      [recommendationKey]: current[recommendationKey].filter(
        (candidate) => String(candidate.id) !== String(item.id),
      ),
    }));
    setExpandedId(null);
  }

  return (
    <section className="recommendations-view">
      <header className="recommendations-header">
        <div>
          <h1>Recommendations</h1>
          <p>Things you might have watched, based on your library and its connections.</p>
        </div>
        <button type="button" onClick={() => loadRecommendations()} disabled={isLoading}>
          {isLoading ? "Analyzing…" : "Refresh"}
        </button>
      </header>

      <div className="recommendation-controls">
        <button type="button" className={activeType === "movie" ? "active" : ""} onClick={() => changeType("movie")}>Movies</button>
        <button type="button" className={activeType === "tv" ? "active" : ""} onClick={() => changeType("tv")}>Series</button>
      </div>

      {error && <div className="recommendations-error">{error}</div>}
      {isLoading && <div className="recommendations-loading">Analyzing your library…</div>}
      {!isLoading && !error && visibleItems.length === 0 && (
        <div className="recommendations-empty">
          <p>No recommendations yet.</p>
          <p>Watch and rate more movies or series to give the system more information.</p>
        </div>
      )}

      {!isLoading && visibleItems.length > 0 && (
        <>
          <div className="movie-grid">
            {visibleItems.map((item) => (
              <div key={`${activeType}-${item.id}`} className="recommendation-card-wrap">
                <MovieCard
                  item={item}
                  type={activeType}
                  isExpanded={expandedId === `${activeType}-${item.id}`}
                  onExpand={handleExpand}
                  onPersonClick={onPersonClick}
                />
                {item.recommendationReason && (
                  <p className="recommendation-reason">{item.recommendationReason}</p>
                )}
                <button
                  type="button"
                  className="recommendation-not-interested"
                  onClick={() => handleNotInterested(item)}
                  aria-label={`Not interested in ${item.title || item.name}`}
                >
                  Not interested
                </button>
              </div>
            ))}
          </div>
          <Pagination
            page={currentPage}
            pageInput={pageInput}
            totalPages={totalPages}
            onPageChange={changePage}
            onPageInputChange={setPageInput}
          />
        </>
      )}
    </section>
  );
}

export default RecommendationsView;
