import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateExplorationRatio,
  MIN_EXPLORATION_RATIO,
  MAX_EXPLORATION_RATIO,
} from "../services/recommendations/explorationPolicy.js";

test("adaptive exploration uses the maximum ratio for an unknown profile", () => {
  assert.equal(calculateExplorationRatio({ score: 0 }), MAX_EXPLORATION_RATIO);
});

test("adaptive exploration uses the minimum ratio for a mature profile", () => {
  assert.equal(calculateExplorationRatio({ score: 1 }), MIN_EXPLORATION_RATIO);
});

test("adaptive exploration interpolates between uncertainty and certainty", () => {
  const ratio = calculateExplorationRatio({ score: 0.5 });

  assert.equal(ratio, 0.2);
});

test("adaptive exploration clamps invalid profile strength", () => {
  assert.equal(calculateExplorationRatio({ score: -1 }), MAX_EXPLORATION_RATIO);
  assert.equal(calculateExplorationRatio({ score: 2 }), MIN_EXPLORATION_RATIO);
  assert.equal(calculateExplorationRatio({}), MAX_EXPLORATION_RATIO);
});
