import test from "node:test";
import assert from "node:assert/strict";

import { validateRecommendationOutput } from "../services/recommendations/recommendationInvariants.js";

function recommendation(id, type = "movie", recommendationScore = 5, diversityScore = 4) {
  return {
    id: String(id),
    type,
    recommendationScore,
    diversityScore,
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
