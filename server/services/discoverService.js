import { tmdbFetch } from "../utils/tmdbClient.js";
import { scoreMovie } from "../utils/tmdbScoring.js";
import { TMDB_PAGE_SIZE, TMDB_MAX_PAGES } from "../config/tmdb.js";

const APP_PAGE_SIZE = 30;

function buildDiscoverEndpoint(type, year, page) {
  if (type === "tv") {
    return (
      `/discover/tv` +
      `?first_air_date_year=${year}` +
      `&sort_by=popularity.desc` +
      `&page=${page}`
    );
  }

  return (
    `/discover/movie` +
    `?primary_release_year=${year}` +
    `&sort_by=popularity.desc` +
    `&page=${page}`
  );
}

function buildSearchEndpoint(type, query, page) {
  const searchType = type === "tv" ? "tv" : "movie";

  return (
    `/search/${searchType}` +
    `?query=${encodeURIComponent(query)}` +
    `&page=${page}`
  );
}

async function fetchTmdbPage({ type, query, year, page }) {
  const endpoint = query
    ? buildSearchEndpoint(type, query, page)
    : buildDiscoverEndpoint(type, year || new Date().getFullYear(), page);

  return tmdbFetch(endpoint);
}

function addScores(results) {
  return results.map((item) => {
    const { score, likelihood } = scoreMovie(item);

    return {
      ...item,
      watchScore: score,
      likelihood,
    };
  });
}

export async function discoverMedia({
  type = "movie",
  query = "",
  year = "",
  page = 1,
}) {
  const appPage = Math.max(Number(page) || 1, 1);

  /*
   * Our app:
   *   30 results per page
   *
   * TMDB:
   *   20 results per page
   *
   * Convert our app-page offset into TMDB pages.
   */
  const offset = (appPage - 1) * APP_PAGE_SIZE;

  const tmdbStartPage = Math.floor(offset / TMDB_PAGE_SIZE) + 1;

  const offsetInsidePage = offset % TMDB_PAGE_SIZE;

  const pagesNeeded = Math.ceil(
    (offsetInsidePage + APP_PAGE_SIZE) / TMDB_PAGE_SIZE,
  );

  const tmdbEndPage = Math.min(tmdbStartPage + pagesNeeded - 1, TMDB_MAX_PAGES);

  let allResults = [];
  let totalResults = 0;

  for (let tmdbPage = tmdbStartPage; tmdbPage <= tmdbEndPage; tmdbPage++) {
    const data = await fetchTmdbPage({
      type,
      query,
      year,
      page: tmdbPage,
    });

    allResults.push(...(data.results || []));

    totalResults = data.total_results || 0;
  }

  const results = addScores(
    allResults.slice(offsetInsidePage, offsetInsidePage + APP_PAGE_SIZE),
  );

  const maxAccessibleResults = TMDB_MAX_PAGES * TMDB_PAGE_SIZE;

  const totalPages = Math.min(
    Math.ceil(totalResults / APP_PAGE_SIZE),
    Math.ceil(maxAccessibleResults / APP_PAGE_SIZE),
  );

  return {
    page: appPage,
    total_pages: totalPages,
    total_results: totalResults,
    results,
  };
}
export async function discoverPersonCredits({
  personId,
  role = "actor",
  page = 1,
}) {
  const data = await tmdbFetch(`/person/${personId}/combined_credits`);

  let credits = [];

  if (role === "director") {
    credits = (data.crew || []).filter(
      (item) => item.media_type === "movie" && item.job === "Director",
    );
  } else {
    credits = data.cast || [];
  }

  const normalized = credits
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .filter((item) => item.id != null)
    .sort((a, b) => {
      const dateA = a.release_date || a.first_air_date || "";
      const dateB = b.release_date || b.first_air_date || "";

      return dateB.localeCompare(dateA);
    });

  const APP_PAGE_SIZE = 30;
  const appPage = Math.max(Number(page) || 1, 1);

  const totalResults = normalized.length;
  const totalPages = Math.ceil(totalResults / APP_PAGE_SIZE);

  const start = (appPage - 1) * APP_PAGE_SIZE;

  const results = normalized
    .slice(start, start + APP_PAGE_SIZE)
    .map((item) => ({
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

  return {
    page: appPage,
    total_pages: totalPages,
    total_results: totalResults,
    results,
  };
}
