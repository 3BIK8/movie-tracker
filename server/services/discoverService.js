import { tmdbFetch } from "../utils/tmdbClient.js";
import { scoreMovie } from "../utils/tmdbScoring.js";
import { TMDB_PAGE_SIZE, TMDB_MAX_PAGES } from "../config/tmdb.js";

const APP_PAGE_SIZE = 30;

function getSortValue(type, sort) {
  const sortMap = {
    popularity: "popularity.desc",
    rating: "vote_average.desc",
    newest: type === "tv" ? "first_air_date.desc" : "primary_release_date.desc",
    oldest: type === "tv" ? "first_air_date.asc" : "primary_release_date.asc",
  };
  return sortMap[sort] || "popularity.desc";
}

function buildDiscoverEndpoint({ type, year, genre, language, minRating, maxRating, sort, page }) {
  const params = new URLSearchParams();
  if (type === "tv") {
    if (year) params.set("first_air_date_year", year);
  } else if (year) {
    params.set("primary_release_year", year);
  }
  if (genre) params.set("with_genres", genre);
  if (language) params.set("with_original_language", language);
  if (minRating !== "") params.set("vote_average.gte", minRating);
  if (maxRating !== "") params.set("vote_average.lte", maxRating);
  params.set("sort_by", getSortValue(type, sort));
  params.set("page", page);
  return `/discover/${type === "tv" ? "tv" : "movie"}?${params.toString()}`;
}

function buildSearchEndpoint(type, query, year, page) {
  const searchType = type === "tv" ? "tv" : "movie";
  const params = new URLSearchParams({ query, page });
  if (year) params.set("year", year);
  return `/search/${searchType}?${params.toString()}`;
}

function matchesFilters(item, { genre, language, minRating, maxRating }) {
  if (genre) {
    const requestedGenres = genre.split(",").map(Number).filter(Number.isFinite);
    const itemGenres = Array.isArray(item.genre_ids) ? item.genre_ids : [];
    if (!requestedGenres.some((id) => itemGenres.includes(id))) return false;
  }
  if (language && item.original_language !== language) return false;
  const rating = Number(item.vote_average);
  if (minRating !== "" && (!Number.isFinite(rating) || rating < Number(minRating))) return false;
  if (maxRating !== "" && (!Number.isFinite(rating) || rating > Number(maxRating))) return false;
  return true;
}

function sortSearchResults(results, sort) {
  const dateValue = (item) => item.release_date || item.first_air_date || "";
  const numeric = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  return [...results].sort((a, b) => {
    if (sort === "rating") return numeric(b.vote_average) - numeric(a.vote_average);
    if (sort === "newest") return dateValue(b).localeCompare(dateValue(a));
    if (sort === "oldest") return dateValue(a).localeCompare(dateValue(b));
    if (sort === "popularity") return numeric(b.popularity) - numeric(a.popularity);
    return 0;
  });
}

async function fetchTmdbPage({ type, query, year, genre, language, minRating, maxRating, sort, page }) {
  if (query) {
    const data = await tmdbFetch(buildSearchEndpoint(type, query, year, page));
    const filtered = (data.results || []).filter((item) => matchesFilters(item, { genre, language, minRating, maxRating }));
    return { ...data, results: sortSearchResults(filtered, sort) };
  }
  return tmdbFetch(buildDiscoverEndpoint({ type, year, genre, language, minRating, maxRating, sort, page }));
}

function addScores(results) {
  return results.map((item) => {
    const { score, likelihood } = scoreMovie(item);
    return { ...item, watchScore: score, likelihood };
  });
}

export async function discoverMedia({ type = "movie", query = "", year = "", genre = "", language = "", minRating = "", maxRating = "", sort = "popularity", page = 1 }) {
  const appPage = Math.max(Number(page) || 1, 1);
  const offset = (appPage - 1) * APP_PAGE_SIZE;

  if (query) {
    const tmdbStartPage = Math.floor(offset / TMDB_PAGE_SIZE) + 1;
    const offsetInsidePage = offset % TMDB_PAGE_SIZE;
    const pagesNeeded = Math.ceil((offsetInsidePage + APP_PAGE_SIZE) / TMDB_PAGE_SIZE);
    const tmdbEndPage = Math.min(tmdbStartPage + pagesNeeded - 1, TMDB_MAX_PAGES);
    let allResults = [];
    let sourceTotal = 0;

    for (let tmdbPage = tmdbStartPage; tmdbPage <= tmdbEndPage; tmdbPage++) {
      const data = await fetchTmdbPage({ type, query, year, genre, language, minRating, maxRating, sort, page: tmdbPage });
      allResults.push(...(data.results || []));
      sourceTotal = data.total_results || sourceTotal;
    }

    const results = addScores(allResults.slice(offsetInsidePage, offsetInsidePage + APP_PAGE_SIZE));
    const estimatedFilteredPages = Math.max(1, Math.ceil(Math.min(sourceTotal, TMDB_MAX_PAGES * TMDB_PAGE_SIZE) / APP_PAGE_SIZE));
    return { page: appPage, total_pages: estimatedFilteredPages, total_results: sourceTotal, results };
  }

  const tmdbStartPage = Math.floor(offset / TMDB_PAGE_SIZE) + 1;
  const offsetInsidePage = offset % TMDB_PAGE_SIZE;
  const pagesNeeded = Math.ceil((offsetInsidePage + APP_PAGE_SIZE) / TMDB_PAGE_SIZE);
  const tmdbEndPage = Math.min(tmdbStartPage + pagesNeeded - 1, TMDB_MAX_PAGES);
  let allResults = [];
  let totalResults = 0;

  for (let tmdbPage = tmdbStartPage; tmdbPage <= tmdbEndPage; tmdbPage++) {
    const data = await fetchTmdbPage({ type, query, year, genre, language, minRating, maxRating, sort, page: tmdbPage });
    allResults.push(...(data.results || []));
    totalResults = data.total_results || 0;
  }

  const results = addScores(allResults.slice(offsetInsidePage, offsetInsidePage + APP_PAGE_SIZE));
  const maxAccessibleResults = TMDB_MAX_PAGES * TMDB_PAGE_SIZE;
  const totalPages = Math.min(Math.ceil(totalResults / APP_PAGE_SIZE), Math.ceil(maxAccessibleResults / APP_PAGE_SIZE));
  return { page: appPage, total_pages: totalPages, total_results: totalResults, results };
}

export async function discoverPersonCredits({ personId, role = "actor", page = 1 }) {
  const data = await tmdbFetch(`/person/${personId}/combined_credits`);
  const credits = role === "director"
    ? (data.crew || []).filter((item) => item.media_type === "movie" && item.job === "Director")
    : data.cast || [];

  const normalized = credits
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .filter((item) => item.id != null)
    .sort((a, b) => {
      const dateA = a.release_date || a.first_air_date || "";
      const dateB = b.release_date || b.first_air_date || "";
      return dateB.localeCompare(dateA);
    });

  const appPage = Math.max(Number(page) || 1, 1);
  const totalResults = normalized.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / APP_PAGE_SIZE));
  const start = (appPage - 1) * APP_PAGE_SIZE;
  const results = normalized.slice(start, start + APP_PAGE_SIZE).map((item) => ({
    id: item.id,
    media_type: item.media_type,
    title: item.media_type === "movie" ? item.title : item.name,
    name: item.name,
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    overview: item.overview,
    release_date: item.release_date,
    first_air_date: item.first_air_date,
    vote_average: item.vote_average,
    popularity: item.popularity,
  }));

  return { page: appPage, total_pages: totalPages, total_results: totalResults, results };
}
