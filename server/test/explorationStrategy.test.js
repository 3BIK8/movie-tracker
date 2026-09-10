import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExplorationQueries,
  getExplorationQualityFloor,
} from "../services/recommendations/explorationStrategy.js";

const profile = {
  genres: {
    "80": { evidenceScore: 2.5, appearances: 4 },
    "18": { evidenceScore: 1.2, appearances: 2 },
  },
  languages: {
    en: { evidenceScore: 2.1, appearances: 4 },
  },
};

function deterministicRandom() {
  return 0.1;
}

test("exploration uses quality floors appropriate to each media type", () => {
  assert.deepEqual(getExplorationQualityFloor("movie"), {
    voteAverage: 5.8,
    voteCount: 50,
  });

  assert.deepEqual(getExplorationQualityFloor("tv"), {
    voteAverage: 5.8,
    voteCount: 30,
  });
});

test("exploration queries are bounded, profile-aware, and deterministic with injected randomness", () => {
  const queries = buildExplorationQueries("movie", profile, 3, deterministicRandom);

  assert.equal(queries.length, 3);
  assert.equal(new Set(queries.map((query) => query.strategy)).size, 3);

  for (const query of queries) {
    assert.match(query.endpoint, /^\/discover\/movie\?/);
    assert.match(query.endpoint, /vote_average\.gte=5\.8/);
    assert.match(query.endpoint, /vote_count\.gte=50/);
    assert.match(query.endpoint, /primary_release_date\.gte=/);
    assert.match(query.endpoint, /primary_release_date\.lte=/);
  }

  const profileGenreQuery = queries.find((query) => query.strategy === "profile_genre");
  const profileLanguageQuery = queries.find((query) => query.strategy === "profile_language");

  if (profileGenreQuery) {
    assert.match(profileGenreQuery.endpoint, /with_genres=80/);
  }

  if (profileLanguageQuery) {
    assert.match(profileLanguageQuery.endpoint, /with_original_language=en/);
  }
});

test("default exploration generation is deterministic for the same seed", () => {
  const first = buildExplorationQueries("movie", profile, 3, null, "history-seed");
  const second = buildExplorationQueries("movie", profile, 3, null, "history-seed");

  assert.deepEqual(second, first);
});

test("profile strategies are omitted when the profile has no usable evidence", () => {
  const queries = buildExplorationQueries("tv", {}, 4, deterministicRandom);

  assert.ok(
    queries.every(
      (query) => !["profile_genre", "profile_language"].includes(query.strategy),
    ),
  );
});

test("exploration rejects unsupported media types", () => {
  assert.throws(
    () => buildExplorationQueries("person", profile),
    /Unsupported media type/,
  );
});
