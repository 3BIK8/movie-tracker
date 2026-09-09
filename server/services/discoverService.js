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

function buildDiscoverEndpoint({
  type,
  year,
  genre,
  language,
  minRating,
  maxRating,
  sort,
  page,
}) {
  const params = new URLSearchParams();

  if (type === "tv") {
    if (year) {
      params.set("first_air_date_year", year);
    }
  } else if (year) {
    params.set("primary_release_year", year);
  }

  if (genre) {
    params.set("with_genres", genre);
  }

  if (language) {
    params.set("with_original_language", language);
  }

  if (minRating !== "") {
    params.set("vote_average.gte", minRating);
  }

  if (maxRating !== "") {
    params.set("vote_average.lte", maxRating);
  }

  params.set("sort_by", getSortValue(type, sort));

  params.set("page", page);

  return `/discover/${type === "tv" ? "tv" : "movie"}?${params.toString()}`;
}

function buildSearchEndpoint(type, query, page) {
  const searchType = type === "tv" ? "tv" : "movie";

  return (
    `/search/${searchType}` +
    `?query=${encodeURIComponent(query)}` +
    `&page=${page}`
  );
}

async function fetchTmdbPage({
  type,
  query,
  year,
  genre,
  language,
  minRating,
  maxRating,
  sort,
  page,
}) {
  if (query) {
    return tmdbFetch(buildSearchEndpoint(type, query, page));
  }

  return tmdbFetch(
    buildDiscoverEndpoint({
      type,
      year,
      genre,
      language,
      minRating,
      maxRating,
      sort,
      page,
    }),
  );
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
  genre = "",
  language = "",
  minRating = "",
  maxRating = "",
  sort = "popularity",
  page = 1,
}) {
  const appPage = Math.max(Number(page) || 1, 1);

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
      genre,
      language,
      minRating,
      maxRating,
      sort,
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
