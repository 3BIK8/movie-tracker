import test from "node:test";
import assert from "node:assert/strict";
import {
  createRecommendationMediaKey,
  filterDisplayedRecommendations,
  getExcludedRecommendationIds,
} from "./recommendationDisplayFilter.js";

test("recommendation media keys are canonical across numeric id forms", () => {
  assert.equal(createRecommendationMediaKey("MOVIE", "00123"), "movie:123");
  assert.equal(createRecommendationMediaKey("tv", 123), "tv:123");
});

test("watched, to-watch, and not-sure titles are excluded from display", () => {
  const history = [
    { type: "movie", id: "10", status: "watched" },
    { type: "movie", id: 11, status: "to_watch" },
    { type: "tv", id: "12", status: "not_sure" },
    { type: "movie", id: "13", status: null },
  ];

  const excluded = getExcludedRecommendationIds(history);
  assert.deepEqual([...excluded].sort(), ["movie:10", "movie:11", "tv:12"]);

  const result = filterDisplayedRecommendations(
    [
      { type: "movie", id: "10" },
      { type: "movie", id: "13" },
      { type: "tv", id: "12" },
    ],
    history,
  );

  assert.deepEqual(result.map((item) => `${item.type}:${item.id}`), ["movie:13"]);
});

test("invalid recommendation identities are removed rather than rendered", () => {
  const result = filterDisplayedRecommendations(
    [
      { type: "movie", id: "" },
      { type: "movie", id: "20" },
    ],
    [],
  );

  assert.deepEqual(result.map((item) => item.id), ["20"]);
});
