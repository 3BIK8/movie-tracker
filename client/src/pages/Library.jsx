import { useMemo, useState } from "react";
import { useWatchHistory } from "../hooks/useWatchHistory";
import MovieCard from "../components/MovieCard";

function Library() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");

  const [sortBy, setSortBy] = useState("newest");
  const { history } = useWatchHistory();
  const [expandedId, setExpandedId] = useState(null);

  const items = Object.values(history);

  const genres = useMemo(() => {
    return [
      ...new Set(
        items.flatMap((item) =>
          Array.isArray(item.genres) ? item.genres : [],
        ),
      ),
    ].sort();
  }, [items]);

  const filteredItems = items
    .filter((item) => {
      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter;

      const matchesType = typeFilter === "all" || item.type === typeFilter;

      const matchesGenre =
        genreFilter === "all" || item.genres?.includes(genreFilter);

      return matchesStatus && matchesType && matchesGenre;
    })
    .sort((a, b) => {
      const titleA = a.title || "";
      const titleB = b.title || "";

      switch (sortBy) {
        case "oldest":
          return (a.date || "").localeCompare(b.date || "");

        case "title-asc":
          return titleA.localeCompare(titleB);

        case "title-desc":
          return titleB.localeCompare(titleA);

        case "rating":
          const ratingOrder = {
            S: 0,
            A: 1,
            B: 2,
            C: 3,
            D: 4,
          };

          const ratingA = ratingOrder[a.rating] ?? 5;
          const ratingB = ratingOrder[b.rating] ?? 5;

          return ratingA - ratingB;

        case "newest":
        default:
          return (b.date || "").localeCompare(a.date || "");
      }
    });

  function resetExpanded() {
    setExpandedId(null);
  }

  return (
    <>
      <h1>My Library</h1>

      <div className="library-filters">
        {[
          ["all", "All"],
          ["watched", "Watched"],
          ["not_sure", "Not Sure"],
          ["to_watch", "To Watch"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={statusFilter === value ? "active" : ""}
            onClick={() => {
              setStatusFilter(value);
              resetExpanded();
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="library-type-filters">
        {[
          ["all", "All"],
          ["movie", "Movies"],
          ["tv", "TV Shows"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={typeFilter === value ? "active" : ""}
            onClick={() => {
              setTypeFilter(value);
              resetExpanded();
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="library-genre-filter">
        <label htmlFor="genre-filter">Genre</label>

        <select
          id="genre-filter"
          value={genreFilter}
          onChange={(event) => {
            setGenreFilter(event.target.value);
            resetExpanded();
          }}
        >
          <option value="all">All Genres</option>

          {genres.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
      </div>
      <div className="library-sort">
        <label htmlFor="library-sort">Sort</label>

        <select
          id="library-sort"
          value={sortBy}
          onChange={(event) => {
            setSortBy(event.target.value);
            setExpandedId(null);
          }}
        >
          <option value="newest">Newest release</option>
          <option value="oldest">Oldest release</option>
          <option value="title-asc">Title A–Z</option>
          <option value="title-desc">Title Z–A</option>
          <option value="rating">Highest personal rating</option>
        </select>
      </div>
      <section className="movie-grid">
        {filteredItems
          .filter((item) => item?.id != null)
          .map((item) => {
            const id = `${item.type}-${item.id}`;

            return (
              <MovieCard
                key={id}
                item={{
                  id: item.id,
                  title: item.title,
                  name: item.title,
                  release_date: item.date,
                  first_air_date: item.date,
                  poster_path: item.poster_path,
                }}
                type={item.type}
                isExpanded={expandedId === id}
                onExpand={(newId) =>
                  setExpandedId((current) => (current === newId ? null : newId))
                }
              />
            );
          })}
      </section>

      {filteredItems.length === 0 && (
        <p className="status-message">No items in this category.</p>
      )}
    </>
  );
}

export default Library;
