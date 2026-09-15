import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRecommendationCapacity,
  countRecentRecommendationExposures,
  RECOMMENDATION_PAGE_SIZE,
} from "../services/recommendations/recommendationCapacity.js";

test("recommendation capacity is independent from UI page size", () => {
  const capacity = calculateRecommendationCapacity({ historyCount: 25, recentExposureCount: 0 });
  assert.equal(capacity % RECOMMENDATION_PAGE_SIZE, 0);
  assert.ok(capacity >= RECOMMENDATION_PAGE_SIZE * 3);
});

test("recommendation capacity grows as navigation consumes the pool", () => {
  const fresh = calculateRecommendationCapacity({ historyCount: 100, recentExposureCount: 0 });
  const consumed = calculateRecommendationCapacity({ historyCount: 100, recentExposureCount: 80 });
  assert.ok(consumed > fresh);
});

test("recommendation capacity remains bounded for very large histories", () => {
  const capacity = calculateRecommendationCapacity({ historyCount: 100000, recentExposureCount: 100000 });
  assert.equal(capacity, RECOMMENDATION_PAGE_SIZE * 12);
});

test("recent exposure counting ignores expired and malformed entries", () => {
  const now = Date.parse("2026-09-15T12:00:00.000Z");
  const feedback = {
    exposures: [
      { exposedAt: "2026-09-15T11:00:00.000Z" },
      { exposedAt: "2026-08-01T11:00:00.000Z" },
      { exposedAt: "not-a-date" },
    ],
  };

  assert.equal(countRecentRecommendationExposures(feedback, now, 30), 1);
});
