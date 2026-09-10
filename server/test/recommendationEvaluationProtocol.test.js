import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateMetricVectors,
  buildTemporalHoldout,
} from "../services/recommendations/recommendationEvaluationProtocol.js";

function watched(id, timestamp, rating = "S", favorite = false) {
  return {
    id,
    type: "movie",
    status: "watched",
    rating,
    favorite,
    lastInteractedAt: timestamp,
  };
}

const history = [
  watched("1", "2026-01-01T00:00:00.000Z", "S"),
  watched("2", "2026-02-01T00:00:00.000Z", "A"),
  watched("3", "2026-03-01T00:00:00.000Z", "D"),
  watched("4", "2026-04-01T00:00:00.000Z", "S", true),
  watched("5", "2026-05-01T00:00:00.000Z", "B"),
];

test("temporal holdout keeps future interactions out of training", () => {
  const split = buildTemporalHoldout(history, {
    testFraction: 0.4,
    minTrainInteractions: 3,
    minTestInteractions: 1,
  });

  assert.equal(split.evaluated, true);
  assert.equal(split.train.length, 3);
  assert.equal(split.test.length, 2);
  assert.ok(split.cutoff > "2026-03-01T00:00:00.000Z");
  assert.deepEqual([...split.relevantIds], ["movie:4", "movie:5"]);
});

test("explicit negative future feedback is not treated as a positive target", () => {
  const split = buildTemporalHoldout([
    watched("1", "2026-01-01T00:00:00.000Z", "S"),
    watched("2", "2026-02-01T00:00:00.000Z", "A"),
    watched("3", "2026-03-01T00:00:00.000Z", "S"),
    watched("4", "2026-04-01T00:00:00.000Z", "D"),
  ], {
    testFraction: 0.5,
    minTrainInteractions: 2,
  });

  assert.equal(split.relevantIds.has("movie:4"), false);
});

test("metric aggregation averages only evaluated runs", () => {
  assert.deepEqual(
    aggregateMetricVectors([
      { evaluated: true, metrics: { recallAtK: 0.5, ndcgAtK: 0.4 } },
      { evaluated: true, metrics: { recallAtK: 1, ndcgAtK: 0.8 } },
      { evaluated: false, metrics: { recallAtK: 0, ndcgAtK: 0 } },
    ]),
    { recallAtK: 0.75, ndcgAtK: 0.6000000000000001 },
  );
});
