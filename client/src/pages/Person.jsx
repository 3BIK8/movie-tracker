import { useCallback, useEffect, useState } from "react";
import MovieCard from "../components/MovieCard";
import Pagination from "../components/Pagination";
import { discoverPerson } from "../services/api";

function Person({ personId, role, personName, onPersonClick }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadCredits = useCallback(async () => {
    if (!personId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await discoverPerson({ personId, role, page });
      setItems(result.results || []);
      setTotalPages(Math.max(1, result.total_pages || 1));
    } catch (requestError) {
      console.error(requestError);
      setError(requestError.message || "Unable to load person's credits.");
    } finally {
      setLoading(false);
    }
  }, [personId, role, page]);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  function handlePageChange(nextPage) {
    const target = Math.min(Math.max(nextPage, 1), totalPages);
    setPage(target);
    setPageInput(String(target));
    setExpandedId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePageInputChange(value) {
    setPageInput(value);
  }

  function handleExpand(id) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <section className="person-view">
      <header className="person-header">
        <button type="button" onClick={() => window.history.back()}>
          ← Back
        </button>
        <div>
          <h1>{personName || "Person"}</h1>
          <p>{role === "director" ? "Director credits" : "Acting credits"}</p>
        </div>
      </header>

      {loading && <div className="status-message">Loading credits…</div>}
      {error && <div className="status-message error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="status-message">No credits found.</div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="movie-grid">
            {items.map((item) => {
              const type = item.media_type === "tv" ? "tv" : "movie";
              const cardId = `${type}-${item.id}`;

              return (
                <MovieCard
                  key={cardId}
                  item={item}
                  type={type}
                  isExpanded={expandedId === cardId}
                  onExpand={handleExpand}
                  onPersonClick={onPersonClick}
                />
              );
            })}
          </div>

          <Pagination
            page={page}
            pageInput={pageInput}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            onPageInputChange={handlePageInputChange}
          />
        </>
      )}
    </section>
  );
}

export default Person;
