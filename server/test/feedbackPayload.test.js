import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_EXPOSURES,
  normalizeRecommendationFeedback,
} from "../services/recommendations/feedbackPayload.js";

test("normalizes feedback to the server contract", () => {
  const result = normalizeRecommendationFeedback({
    exposures: [
      {
        type: "MOVIE",
        id: 42,
        title: "discarded",
        connections: [
          { type: "actor", value: "10" },
          { type: "actor", value: "10" },
          { type: "genre", value: "Action" },
          { value: "missing type" },
        ],
        interactions: [
          { event: "skipped", timestamp: "2026-01-01" },
          { event: "invalid" },
        ],
      },
      { type: "book", id: 1 },
    ],
  });

  assert.deepEqual(result, {
    exposures: [
      {
        type: "movie",
        id: "42",
        pool: null,
        exposedAt: null,
        connections: [
          { type: "actor", value: "10" },
          { type: "genre", value: "Action" },
        ],
        interactions: [
          { event: "skipped", timestamp: "2026-01-01" },
        ],
      },
    ],
  });
});

test("caps the feedback exposure window", () => {
  const result = normalizeRecommendationFeedback({
    exposures: Array.from({ length: MAX_EXPOSURES + 25 }, (_, index) => ({
      type: "movie",
      id: index,
      connections: [],
      interactions: [],
    })),
  });

  assert.equal(result.exposures.length, MAX_EXPOSURES);
  assert.equal(result.exposures[0].id, "25");
  assert.equal(result.exposures.at(-1).id, String(MAX_EXPOSURES + 24));
});

test("rejects malformed feedback", () => {
  assert.equal(normalizeRecommendationFeedback(null), null);
  assert.equal(normalizeRecommendationFeedback({ exposures: "invalid" }), null);
});
