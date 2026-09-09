import { useEffect, useState } from "react";
import MovieCard from "../components/MovieCard";
import Pagination from "../components/Pagination";
import { useDiscoverSearch } from "../hooks/useDiscoverSearch";

function getUrlState() {
  const params = new URLSearchParams(window.location.search);

  const type = params.get("type");
  const personId = params.get("person");
  const role = params.get("role");
  const personName = params.get("name");
  const page = Number(params.get("page"));

  return {
    type: type === "tv" ? "tv" : "movie",
    personFilter:
      personId && ["actor", "director"].includes(role)
        ? {
            id: Number(personId),
            name: personName || "Unknown",
            role,
          }
        : null,
    page: page > 0 ? page : 1,
  };
}

function updateUrl({ type, personFilter, page }) {
  const params = new URLSearchParams(window.location.search);

  params.set("type", type);

  if (personFilter) {
    params.set("person", personFilter.id);
    params.set("role", personFilter.role);
    params.set("name", personFilter.name);
  } else {
    params.delete("person");
    params.delete("role");
    params.delete("name");
  }

  if (page > 1) {
    params.set("page", page);
  } else {
    params.delete("page");
  }

  const query = params.toString();

  window.history.replaceState(
    null,
    "",
    query ? `?${query}` : window.location.pathname,
  );
}

function DiscoverView() {
  const initialState = getUrlState();

  const [type, setType] = useState(initialState.type);
  const [expandedId, setExpandedId] = useState(null);
  const [personFilter, setPersonFilter] = useState(initialState.personFilter);

  const {
    query,
    setQuery,
    year,
    setYear,
    page,
    setPage,
    pageInput,
    setPageInput,
    items,
    totalPages,
    loading,
    error,
    handleSearch,
    changeType,
  } = useDiscoverSearch({
    type,
    personFilter,
    initialPage: initialState.page,
  });

  useEffect(() => {
    updateUrl({
      type,
      personFilter,
      page,
    });
  }, [type, personFilter, page]);

  function handleTypeChange(newType) {
    setType(newType);
    setPersonFilter(null);
    changeType(newType);
    setExpandedId(null);
  }

  function handlePersonClick(person) {
    setPersonFilter({
      id: person.id,
      name: person.name,
      role: person.role,
    });

    setPage(1);
    setExpandedId(null);
  }

  function clearPersonFilter() {
    setPersonFilter(null);
    setPage(1);
    setExpandedId(null);
  }

  return (
    <>
      <header>
        <h1>My Watch History</h1>

        <div className="type-buttons">
          <button
            className={type === "movie" ? "active" : ""}
            onClick={() => handleTypeChange("movie")}
          >
            Movies
          </button>

          <button
            className={type === "tv" ? "active" : ""}
            onClick={() => handleTypeChange("tv")}
          >
            TV Shows
          </button>
        </div>

        {personFilter ? (
          <div className="person-filter">
            <span>
              {personFilter.role === "director" ? "Director" : "Actor"}:{" "}
              {personFilter.name}
            </span>

            <button type="button" onClick={clearPersonFilter}>
              Clear
            </button>
          </div>
        ) : (
          <form onSubmit={handleSearch}>
            <input
              type="text"
              placeholder={`Search ${
                type === "movie" ? "movies" : "TV shows"
              }...`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <input
              type="number"
              placeholder="Year"
              min="1900"
              max="2026"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />

            <button type="submit">Search</button>
          </form>
        )}
      </header>

      {loading && <p className="status-message">Loading...</p>}

      {error && <p className="status-message error">{error}</p>}

      {!loading && !error && (
        <>
          <section className="movie-grid">
            {items
              .filter((item) => item?.id != null)
              .map((item) => {
                const itemType = item.media_type || type;

                const id = `${itemType}-${item.id}`;

                return (
                  <MovieCard
                    key={id}
                    item={item}
                    type={itemType}
                    isExpanded={expandedId === id}
                    onExpand={(newId) =>
                      setExpandedId((current) =>
                        current === newId ? null : newId,
                      )
                    }
                    onPersonClick={handlePersonClick}
                  />
                );
              })}
          </section>

          <Pagination
            page={page}
            pageInput={pageInput}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageInputChange={setPageInput}
          />
        </>
      )}
    </>
  );
}

export default DiscoverView;
