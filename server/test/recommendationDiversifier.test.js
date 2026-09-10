import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateJaccardSimilarity,
  diversifyRankedCandidates,
} from "../services/recommendations/recommendationDiversifier.js";

function candidate(id, recommendationScore, connections) {
  return {
    id: String(id),
    type: "movie",
    recommendationScore,
    connections,
  };
}

test("jaccard similarity measures shared recommendation relationships", () => {
  const a = candidate(1, 10, [
    { type: "actor", value: 100 },
    { type: "genre", value: 28 },
  ]);
  const b = candidate(2, 9, [
    { type: "actor", value: 100 },
    { type: "genre", value: 35 },
  ]);

  assert.equal(calculateJaccardSimilarity(a, b), 1 / 3);
});

test("diversification can prefer a distinct candidate over a redundant higher-ranked candidate", () => {
  const candidates = [
    candidate(1, 10, [
      { type: "actor", value: 100 },
      { type: "genre", value: 28 },
    ]),
    candidate(2, 9.8, [
      { type: "actor", value: 100 },
      { type: "genre", value: 28 },
    ]),
    candidate(3, 9, [
      { type: "director", value: 200 },
      { type: "genre", value: 18 },
    ]),
  ];

  const result = diversifyRankedCandidates(candidates, 2, 0.8);

  assert.deepEqual(result.map((item) => item.id), ["1", "3"]);
});

test("diversification is deterministic for equal inputs", () => {
  const candidates = [
    candidate(2, 8, [{ type: "genre", value: 28 }]),
    candidate(1, 8, [{ type: "genre", value: 35 }]),
    candidate(3, 7, [{ type: "genre", value: 18 }]),
  ];

  const first = diversifyRankedCandidates(candidates, 3, 0.8);
  const second = diversifyRankedCandidates(candidates, 3, 0.8);

  assert.deepEqual(first, second);
});

test("diversification validates its contract", () => {
  assert.throws(
    () => diversifyRankedCandidates([], 0),
    /positive integer/,
  );

  assert.throws(
    () => diversifyRankedCandidates([candidate(1, 1, [])], 1, 1.5),
    /between 0 and 1/,
  );
});
