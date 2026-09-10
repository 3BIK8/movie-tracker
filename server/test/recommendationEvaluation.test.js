import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRecommendationList,
  precisionAtK,
  recallAtK,
  ndcgAtK,
  diversityAtK,
  noveltyAtK,
  serendipityAtK,
  explorationQuality,
} from "../services/recommendations/recommendationEvaluation.js";

function recommendation(id, connections = [], popularity = 10, pool = "exploitation") {
  return {
    id: String(id),
    type: "movie",
    popularity,
    pool,
    connections,
  };
}

const relevantIds = new Set(["movie:1", "movie:3"]);

const recommendations = [
  recommendation(1, [{ type: "genre", value: "Drama" }], 10),
  recommendation(2, [{ type: "genre", value: "Drama" }], 100),
  recommendation(3, [{ type: "genre", value: "Sci-Fi" }], 5),
];

test("precision and recall at K use canonical media identity", () => {
  assert.equal(precisionAtK(recommendations, relevantIds, 3), 2 / 3);
  assert.equal(recallAtK(recommendations, relevantIds, 3), 1);
});

test("NDCG rewards relevant items near the top", () => {
  assert.ok(ndcgAtK(recommendations, relevantIds, 3) > 0.8);
});

test("diversity increases when recommendations have less overlap", () => {
  assert.ok(diversityAtK(recommendations, 3) > 0);
  assert.equal(diversityAtK([recommendation(1), recommendation(2)], 2), 1);
});

test("novelty favors less popular recommendations", () => {
  const lowPopularity = noveltyAtK([recommendation(1, [], 1)], 1);
  const highPopularity = noveltyAtK([recommendation(1, [], 100)], 1);

  assert.ok(lowPopularity > highPopularity);
});

test("serendipity rewards relevant items dissimilar to known preferences", () => {
  const history = [
    {
      type: "movie",
      id: "99",
      rating: "S",
      connections: [{ type: "genre", value: "Drama" }],
    },
  ];

  const score = serendipityAtK(recommendations, relevantIds, history, 3);

  assert.ok(score > 0);
});

test("exploration quality measures positive downstream feedback", () => {
  const exposures = [
    {
      pool: "exploration",
      interactions: [{ event: "status", status: "watched" }],
    },
    {
      pool: "exploration",
      interactions: [{ event: "opened" }],
    },
  ];

  assert.equal(explorationQuality(exposures), 0.5);
});

test("evaluation returns the complete metric vector", () => {
  const metrics = evaluateRecommendationList({
    recommendations,
    relevantIds,
    history: [],
    k: 3,
    exposures: [],
  });

  assert.deepEqual(Object.keys(metrics), [
    "precisionAtK",
    "recallAtK",
    "ndcgAtK",
    "diversityAtK",
    "noveltyAtK",
    "serendipityAtK",
    "explorationQuality",
  ]);
});
