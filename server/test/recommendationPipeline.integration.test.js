import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DATABASE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `../data/recommendation-pipeline-${process.pid}.sqlite`,
);
process.env.DATABASE_PATH = TEST_DATABASE_PATH;

const { analyzeWatchHistory } = await import("../services/recommendations/recommendationsService.js");

const originalFetch = global.fetch;
const originalToken = process.env.TMDB_TOKEN;

function tmdbResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async json() { return data; },
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
    vote_count: 100,
    popularity: 20,
    genres: [{ id: 18, name: "Drama" }],
    production_companies: [{ id: 30, name: "Test Studio" }],
    credits: {
      cast: [{ id: 10, name: "Test Actor", profile_path: null }],
      crew: [{ id: 20, name: "Test Director", job: "Director", profile_path: null }],
    },
    created_by: type === "tv" ? [{ id: 20, name: "Test Creator" }] : [],
    keywords: isMovie ? { keywords: [{ id: 40, name: "test" }] } : { results: [{ id: 40, name: "test" }] },
    ...overrides,
  };
}

function buildFetchMock() {
  return async (url) => {
    const parsedUrl = new URL(url);
    const endpoint = parsedUrl.pathname.replace(/^\/3/, "");
    if (endpoint === "/movie/1001") return tmdbResponse(mediaDetails(1001, "movie"));
    if (endpoint === "/movie/1002") return tmdbResponse(mediaDetails(1002, "movie", { credits: { cast: [{ id: 11, name: "To Watch Actor" }], crew: [] } }));
    if (endpoint === "/movie/2001") return tmdbResponse(mediaDetails(2001, "movie"));
    if (endpoint === "/movie/2002") return tmdbResponse(mediaDetails(2002, "movie"));
    if (endpoint === "/movie/3001") return tmdbResponse(mediaDetails(3001, "movie", { credits: { cast: [], crew: [] }, genres: [{ id: 35, name: "Comedy" }], production_companies: [], keywords: { keywords: [] } }));
    if (endpoint === "/tv/4001") return tmdbResponse(mediaDetails(4001, "tv", { credits: { cast: [], crew: [] }, created_by: [] }));

    if (endpoint === "/person/10/movie_credits") {
      return tmdbResponse({
        cast: [{ id: 2001, title: "Movie 2001", release_date: "2022-01-01", genre_ids: [18], overview: "Exploitation candidate", poster_path: null, popularity: 12 }],
        crew: [],
      });
    }

    if (endpoint.startsWith("/discover/movie")) {
      const hasProfileFilter = parsedUrl.searchParams.has("with_genres") || parsedUrl.searchParams.has("with_companies") || parsedUrl.searchParams.has("with_keywords");
      return tmdbResponse({ results: [{
        id: hasProfileFilter ? 2002 : 3001,
        title: hasProfileFilter ? "Movie 2002" : "Movie 3001",
        release_date: "2019-01-01",
        genre_ids: [18],
        overview: hasProfileFilter ? "Exploitation candidate" : "Generic discovery candidate",
        poster_path: null,
        popularity: 8,
      }] });
    }
    if (endpoint.startsWith("/discover/tv")) {
      return tmdbResponse({ results: [{ id: 4001, name: "TV 4001", first_air_date: "2021-01-01", genre_ids: [18], overview: "Generic discovery candidate", poster_path: null, popularity: 8 }] });
    }
    return tmdbResponse({});
  };
}

test("recommendation pipeline preserves historical identity, provenance, diversity, and navigation novelty contracts", async () => {
  process.env.TMDB_TOKEN = "test-token";
  global.fetch = buildFetchMock();

  try {
    const history = [
      { id: "1001", type: "movie", rating: "S", status: "watched" },
      { id: "1002", type: "movie", rating: "C", status: "to_watch" },
    ];

    const first = await analyzeWatchHistory(history);
    const visibleFirstPage = first.recommendations.movies.slice(0, 20);
    const second = await analyzeWatchHistory(history, { exposures: visibleFirstPage });
    const firstRepeated = first.recommendations.movies.find((item) => item.id === "2001");
    const secondRepeated = second.recommendations.movies.find((item) => item.id === "2001");

    assert.ok(firstRepeated);
    assert.equal(secondRepeated, undefined);

    const movies = first.recommendations.movies;
    const tv = first.recommendations.tv;
    assert.ok(movies.length > 0);
    assert.equal(tv.length, 0);
    assert.ok(!movies.some((item) => ["1001", "1002"].includes(item.id)));
    assert.ok(movies.every((item) => item.type === "movie"));
    assert.ok(movies.every((item) => Number.isFinite(item.recommendationScore)));
    assert.ok(movies.every((item) => Number.isFinite(item.diversityScore)));
    assert.ok(movies.some((item) => item.id === "2001" && item.pool === "exploitation"));
    assert.ok(movies.every((item) => item.id !== "3001"));
    assert.equal(first.recommendationDiagnostics.watchedHistoryCount, 1);
    assert.ok(first.recommendationDiagnostics.capacity >= first.recommendationDiagnostics.pageSize * 3);
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TMDB_TOKEN;
    else process.env.TMDB_TOKEN = originalToken;
    try {
      fs.rmSync(TEST_DATABASE_PATH, { force: true });
      fs.rmSync(`${TEST_DATABASE_PATH}-wal`, { force: true });
      fs.rmSync(`${TEST_DATABASE_PATH}-shm`, { force: true });
    } catch {
      // Best-effort cleanup; CI workspaces are ephemeral.
    }
  }
});
