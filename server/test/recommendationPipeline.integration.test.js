import test from "node:test";
import assert from "node:assert/strict";

import { analyzeWatchHistory } from "../services/recommendations/recommendationsService.js";

const originalFetch = global.fetch;
const originalToken = process.env.TMDB_TOKEN;

function tmdbResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async json() {
      return data;
    },
  };
}

function mediaDetails(id, type, overrides = {}) {
  const isMovie = type === "movie";

  return {
    id,
    ...(isMovie
      ? { title: `Movie ${id}`, release_date: "2020-01-01" }
      : { name: `TV ${id}`, first_air_date: "2021-01-01" }),
    overview: `Test ${type} ${id}`,
    poster_path: null,
    backdrop_path: null,
    original_language: "en",
    vote_average: 7.5,
    popularity: 20,
    genres: [{ id: 18, name: "Drama" }],
    production_companies: [{ id: 30, name: "Test Studio" }],
    credits: {
      cast: [{ id: 10, name: "Test Actor", profile_path: null }],
      crew: [{ id: 20, name: "Test Director", job: "Director", profile_path: null }],
    },
    created_by: type === "tv" ? [{ id: 20, name: "Test Creator" }] : [],
    keywords: isMovie
      ? { keywords: [{ id: 40, name: "test" }] }
      : { results: [{ id: 40, name: "test" }] },
    ...overrides,
  };
}

function buildFetchMock() {
  return async (url) => {
    const parsedUrl = new URL(url);
    const endpoint = parsedUrl.pathname.replace(/^\/3/, "");

    if (endpoint === "/movie/1001") return tmdbResponse(mediaDetails(1001, "movie"));
    if (endpoint === "/movie/1002") {
      return tmdbResponse(mediaDetails(1002, "movie", {
        credits: { cast: [{ id: 11, name: "To Watch Actor" }], crew: [] },
      }));
    }
    if (endpoint === "/movie/2001") return tmdbResponse(mediaDetails(2001, "movie"));
    if (endpoint === "/movie/2002") return tmdbResponse(mediaDetails(2002, "movie"));
    if (endpoint === "/movie/3001") {
      return tmdbResponse(mediaDetails(3001, "movie", {
        credits: { cast: [], crew: [] },
        genres: [{ id: 35, name: "Comedy" }],
        production_companies: [],
        keywords: { keywords: [] },
      }));
    }
    if (endpoint === "/tv/4001") {
      return tmdbResponse(mediaDetails(4001, "tv", {
        credits: { cast: [], crew: [] },
        created_by: [],
      }));
    }

    if (endpoint === "/person/10/movie_credits") {
      return tmdbResponse({
        cast: [{
          id: 2001,
          title: "Movie 2001",
          release_date: "2022-01-01",
          genre_ids: [18],
          overview: "Exploitation candidate",
          poster_path: null,
          popularity: 12,
        }],
        crew: [],
      });
    }

    if (endpoint.startsWith("/discover/movie")) {
      const hasProfileFilter =
        parsedUrl.searchParams.has("with_genres") ||
        parsedUrl.searchParams.has("with_companies");

      return tmdbResponse({ results: [{
        id: hasProfileFilter ? 2002 : 3001,
        title: hasProfileFilter ? "Movie 2002" : "Movie 3001",
        release_date: "2019-01-01",
        genre_ids: [18],
        overview: hasProfileFilter
          ? "Exploitation candidate"
          : "Exploration candidate",
        poster_path: null,
        popularity: 8,
      }] });
    }

    if (endpoint.startsWith("/discover/tv")) {
      return tmdbResponse({ results: [{
        id: 4001,
        name: "TV 4001",
        first_air_date: "2021-01-01",
        genre_ids: [18],
        overview: "TV exploration candidate",
        poster_path: null,
        popularity: 8,
      }] });
    }

    return tmdbResponse({});
  };
}

function simplify(result) {
  return {
    movies: result.recommendations.movies.map(({ id, type, pool, recommendationScore, diversityScore }) => ({
      id, type, pool, recommendationScore, diversityScore,
    })),
    tv: result.recommendations.tv.map(({ id, type, pool, recommendationScore, diversityScore }) => ({
      id, type, pool, recommendationScore, diversityScore,
    })),
  };
}

test("recommendation pipeline preserves identity, provenance, diversity, and exploration contracts", async () => {
  process.env.TMDB_TOKEN = "test-token";
  global.fetch = buildFetchMock();

  try {
    const history = [
      { id: "1001", type: "movie", rating: "S", status: "watched" },
      { id: "1002", type: "movie", rating: "C", status: "to_watch" },
    ];

    const first = await analyzeWatchHistory(history);
    const second = await analyzeWatchHistory(history);

    assert.deepEqual(simplify(first), simplify(second));

    const movies = first.recommendations.movies;
    const tv = first.recommendations.tv;

    assert.ok(movies.length > 0);
    assert.ok(tv.length > 0);
    assert.ok(!movies.some((item) => ["1001", "1002"].includes(item.id)));
    assert.ok(!tv.some((item) => ["1001", "1002"].includes(item.id)));
    assert.ok(movies.every((item) => item.type === "movie"));
    assert.ok(tv.every((item) => item.type === "tv"));

    assert.ok(movies.filter((item) => item.pool === "exploration").length <= 20);
    assert.ok(tv.filter((item) => item.pool === "exploration").length <= 20);

    assert.ok(movies.every((item) => Number.isFinite(item.recommendationScore)));
    assert.ok(movies.every((item) => Number.isFinite(item.diversityScore)));
    assert.ok(tv.every((item) => Number.isFinite(item.recommendationScore)));
    assert.ok(tv.every((item) => Number.isFinite(item.diversityScore)));

    assert.ok(movies.some((item) => item.id === "2001" && item.pool === "exploitation"));
    assert.ok(movies.some((item) => item.id === "3001" && item.pool === "exploration"));
    assert.ok(tv.some((item) => item.id === "4001" && item.pool === "exploration"));
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TMDB_TOKEN;
    else process.env.TMDB_TOKEN = originalToken;
  }
});
