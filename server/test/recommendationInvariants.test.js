import test from "node:test";
import assert from "node:assert/strict";

import { validateRecommendationOutput } from "../services/recommendations/recommendationInvariants.js";

function recommendation(
  id,
  type = "movie",
  recommendationScore = 5,
  diversityScore = 4,
  pool,
) {
  return {
    id: String(id),
    type,
    recommendationScore,
    diversityScore,
    ...(pool ? { pool } : {}),
  };
}

test("recommendation invariants accept a valid output", () => {
  const recommendations = [recommendation(10), recommendation(20)];

  assert.strictEqual(
    validateRecommendationOutput(recommendations, {
      mediaType: "movie",
      limit: 5,
      knownIds: new Set(["movie:99"]),
    }),
    recommendations,
  );
});

test("recommendation invariants reject duplicates", () => {
  assert.throws(
    () =>
      validateRecommendationOutput(
        [recommendation(10), recommendation(10)],
        { mediaType: "movie", limit: 5 },
      ),
    /Duplicate recommendation identity: movie:10/,
  );
});

test("recommendation invariants reject known media", () => {
  assert.throws(
    () =>
      validateRecommendationOutput(
        [recommendation(10)],
        { mediaType: "movie", limit: 5, knownIds: new Set(["movie:10"]) },
      ),
    /Known media leaked into recommendations: movie:10/,
  );
});

test("recommendation invariants enforce media type isolation", () => {
  assert.throws(
    () =>
      validateRecommendationOutput(
        [recommendation(10, "tv")],
        { mediaType: "movie", limit: 5 },
      ),
    /Recommendation media type mismatch/,
  );
});

test("recommendation invariants reject non-finite scores", () => {
  assert.throws(
    () =>
      validateRecommendationOutput(
        [recommendation(10, "movie", Number.NaN)],
        { mediaType: "movie", limit: 5 },
      ),
    /Invalid recommendation score/,
  );

  assert.throws(
    () =>
      validateRecommendationOutput(
        [recommendation(10, "movie", 5, Infinity)],
        { mediaType: "movie", limit: 5 },
      ),
    /Invalid diversity score/,
  );
});

test("recommendation invariants enforce the final exploration quota", () => {
  const recommendations = [
    recommendation(1, "movie", 5, 4, "exploitation"),
    recommendation(2, "movie", 4, 3, "exploitation"),
    recommendation(3, "movie", 3, 2, "exploitation"),
    recommendation(4, "movie", 2, 1, "exploitation"),
    recommendation(5, "movie", 1, 0, "exploration"),
  ];

  assert.strictEqual(
    validateRecommendationOutput(recommendations, {
      mediaType: "movie",
      limit: 5,
    }),
    recommendations,
  );

  assert.throws(
    () =>
      validateRecommendationOutput(
        [...recommendations, recommendation(6, "movie", 1, 0, "exploration")],
        { mediaType: "movie", limit: 6 },
      ),
    /Recommendation exploration quota exceeded: 2 > 1/,
  );
});
