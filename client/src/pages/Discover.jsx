import { useState } from "react";
import MovieCard from "../components/MovieCard";
import Pagination from "../components/Pagination";
import Select from "../components/Select";
import { useDiscoverSearch } from "../hooks/useDiscoverSearch";

const MOVIE_GENRES = [
  { value: "", label: "Any genre" },
  { value: "28", label: "Action" },
  { value: "12", label: "Adventure" },
  { value: "16", label: "Animation" },
  { value: "35", label: "Comedy" },
  { value: "80", label: "Crime" },
  { value: "99", label: "Documentary" },
  { value: "18", label: "Drama" },
  { value: "10751", label: "Family" },
  { value: "14", label: "Fantasy" },
  { value: "36", label: "History" },
  { value: "27", label: "Horror" },
  { value: "10402", label: "Music" },
  { value: "9648", label: "Mystery" },
  { value: "10749", label: "Romance" },
  { value: "878", label: "Science Fiction" },
  { value: "53", label: "Thriller" },
  { value: "10752", label: "War" },
  { value: "37", label: "Western" },
];

const TV_GENRES = [
  { value: "", label: "Any genre" },
  { value: "10759", label: "Action & Adventure" },
  { value: "16", label: "Animation" },
  { value: "35", label: "Comedy" },
  { value: "80", label: "Crime" },
  { value: "99", label: "Documentary" },
  { value: "18", label: "Drama" },
  { value: "10751", label: "Family" },
  { value: "10762", label: "Kids" },
  { value: "10765", label: "Sci-Fi & Fantasy" },
  { value: "10766", label: "Soap" },
  { value: "10768", label: "War & Politics" },
  { value: "37", label: "Western" },
];

const LANGUAGES = [
  { value: "", label: "Any language" },
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "ar", label: "Arabic" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
];

const SORT_OPTIONS = [
  { value: "popularity", label: "Popularity" },
  { value: "rating", label: "Rating" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

function Discover() {
  const [type, setType] = useState("movie");

  // Controls which expanded card is currently open.
  const [expandedCard, setExpandedCard] = useState(null);

  const {
    query,
    setQuery,
    year,
    setYear,
    genre,
    setGenre,
    language,
    setLanguage,
    minRating,
    setMinRating,
    maxRating,
    setMaxRating,
    sort,
    setSort,
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
  });

  const genres = type === "movie" ? MOVIE_GENRES : TV_GENRES;

  function handleTypeChange(newType) {
    setType(newType);
    setExpandedCard(null);
    changeType(newType);
  }

  function handleExpand(cardId) {
    setExpandedCard((current) => (current === cardId ? null : cardId));
  }

  function handlePageChange(newPage) {
    setExpandedCard(null);
    setPage(newPage);
  }

  return (
    <>
      <header>
        <h1>Discover</h1>

        <div className="discover-type">
          <button
            type="button"
            className={type === "movie" ? "active" : ""}
            onClick={() => handleTypeChange("movie")}
          >
            Movies
          </button>

          <button
            type="button"
            className={type === "tv" ? "active" : ""}
            onClick={() => handleTypeChange("tv")}
          >
            TV Shows
          </button>
        </div>

        <form className="discover-filters" onSubmit={handleSearch}>
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
            max="2100"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />

          <Select
            ariaLabel="Genre"
            value={genre}
            onChange={setGenre}
            options={genres}
          />

          <Select
            ariaLabel="Language"
            value={language}
            onChange={setLanguage}
            options={LANGUAGES}
          />

          <input
            type="number"
            placeholder="Min rating"
            min="0"
            max="10"
            step="0.1"
            value={minRating}
            onChange={(event) => setMinRating(event.target.value)}
          />

          <input
            type="number"
            placeholder="Max rating"
            min="0"
            max="10"
            step="0.1"
            value={maxRating}
            onChange={(event) => setMaxRating(event.target.value)}
          />

          <Select
            ariaLabel="Sort"
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS}
          />

          <button type="submit">Search</button>
        </form>
      </header>

      {loading && <div className="status-message">Loading...</div>}

      {error && <div className="status-message error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="status-message">No results found.</div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="movie-grid">
            {items.map((item) => {
              const cardId = `${type}-${item.id}`;

              return (
                <MovieCard
                  key={cardId}
                  item={item}
                  type={type}
                  isExpanded={expandedCard === cardId}
                  onExpand={handleExpand}
                />
              );
            })}
          </div>

          <Pagination
            page={page}
            pageInput={pageInput}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            onPageInputChange={setPageInput}
          />
        </>
      )}
    </>
  );
}

export default Discover;
