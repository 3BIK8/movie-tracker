import { useMemo, useState } from "react";
import { useWatchHistory } from "../hooks/useWatchHistory";
import MovieCard from "../components/MovieCard";
import Pagination from "../components/Pagination";
import Select from "../components/Select";

const ITEMS_PER_PAGE = 25;

const STATUS_FILTERS = [
  ["all", "All"],
  ["watched", "Watched"],
  ["not_sure", "Not Sure"],
  ["to_watch", "To Watch"],
];

const TYPE_FILTERS = [
  ["all", "All"],
  ["movie", "Movies"],
  ["tv", "TV Shows"],
];

const RATING_OPTIONS = [
  { value: "all", label: "Any Rating" },
  { value: "unrated", label: "Unrated" },
  { value: "S", label: "S" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest release" },
  { value: "oldest", label: "Oldest release" },
  { value: "title-asc", label: "Title A–Z" },
  { value: "title-desc", label: "Title Z–A" },
  { value: "rating", label: "Highest personal rating" },
];

function Library() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [expandedId, setExpandedId] = useState(null);

  const { history } = useWatchHistory();

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

  const years = useMemo(() => {
    return [
      ...new Set(
        items
          .map((item) => {
            const date = item.date || "";
            return date ? date.slice(0, 4) : null;
          })
          .filter(Boolean),
      ),
    ].sort((a, b) => Number(b) - Number(a));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        const matchesStatus =
          statusFilter === "all" || item.status === statusFilter;

        const matchesType = typeFilter === "all" || item.type === typeFilter;

        const matchesGenre =
          genreFilter === "all" || item.genres?.includes(genreFilter);

        const matchesRating =
          ratingFilter === "all" ||
          (ratingFilter === "unrated"
            ? !item.rating
            : item.rating === ratingFilter);

        const itemYear = item.date ? item.date.slice(0, 4) : "";

        const matchesYear = yearFilter === "all" || itemYear === yearFilter;

        return (
          matchesStatus &&
          matchesType &&
          matchesGenre &&
          matchesRating &&
          matchesYear
        );
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

          case "rating": {
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
          }

          case "newest":
          default:
            return (b.date || "").localeCompare(a.date || "");
        }
      });
  }, [
    items,
    statusFilter,
    typeFilter,
    genreFilter,
    ratingFilter,
    yearFilter,
    sortBy,
  ]);

  const totalPages = Math.max(
    Math.ceil(filteredItems.length / ITEMS_PER_PAGE),
    1,
  );

  const safePage = Math.min(page, totalPages);

  const visibleItems = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;

    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, safePage]);

  function resetView() {
    setPage(1);
    setPageInput("1");
    setExpandedId(null);
  }

  function handleStatusChange(value) {
    setStatusFilter(value);
    resetView();
  }

  function handleTypeChange(value) {
    setTypeFilter(value);
    resetView();
  }

  function handleGenreChange(value) {
    setGenreFilter(value);
    resetView();
  }

  function handleRatingChange(value) {
    setRatingFilter(value);
    resetView();
  }

  function handleYearChange(value) {
    setYearFilter(value);
    resetView();
  }

  function handleSortChange(value) {
    setSortBy(value);
    resetView();
  }

  function handlePageChange(newPage) {
    const safePage = Math.min(Math.max(newPage, 1), totalPages);

    setPage(safePage);
    setPageInput(String(safePage));
    setExpandedId(null);
  }

  return (
    <>
      <header className="library-header">
        <h1>My Library</h1>

        <div className="library-status-filters">
          {STATUS_FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={statusFilter === value ? "active" : ""}
              onClick={() => handleStatusChange(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="library-type-filters">
          {TYPE_FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={typeFilter === value ? "active" : ""}
              onClick={() => handleTypeChange(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="library-controls">
          <div className="library-control">
            <label>Genre</label>

            <Select
              ariaLabel="Genre"
              value={genreFilter}
              onChange={handleGenreChange}
              options={[
                {
                  value: "all",
                  label: "All Genres",
                },
                ...genres.map((genre) => ({
                  value: genre,
                  label: genre,
                })),
              ]}
            />
          </div>

          <div className="library-control">
            <label>Rating</label>

            <Select
              ariaLabel="Rating"
              value={ratingFilter}
              onChange={handleRatingChange}
              options={RATING_OPTIONS}
            />
          </div>

          <div className="library-control">
            <label>Year</label>

            <Select
              ariaLabel="Release year"
              value={yearFilter}
              onChange={handleYearChange}
              options={[
                {
                  value: "all",
                  label: "Any Year",
                },
                ...years.map((year) => ({
                  value: year,
                  label: year,
                })),
              ]}
            />
          </div>

          <div className="library-control">
            <label>Sort</label>

            <Select
              ariaLabel="Sort"
              value={sortBy}
              onChange={handleSortChange}
              options={SORT_OPTIONS}
            />
          </div>
        </div>
      </header>

      {filteredItems.length === 0 ? (
        <p className="status-message">No items in this category.</p>
      ) : (
        <>
          <section className="movie-grid">
            {visibleItems
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
                      setExpandedId((current) =>
                        current === newId ? null : newId,
                      )
                    }
                  />
                );
              })}
          </section>

          {totalPages > 1 && (
            <Pagination
              page={safePage}
              pageInput={pageInput}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              onPageInputChange={setPageInput}
            />
          )}
        </>
      )}
    </>
  );
}

export default Library;
