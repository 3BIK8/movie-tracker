import test from "node:test";
import assert from "node:assert/strict";

import { mixRecommendationPools } from "../services/recommendations/recommendationMixer.js";

function item(id, pool) {
  return { id: String(id), type: "movie", pool };
}

test("recommendation mix enforces the 80/20 exploitation-exploration policy", () => {
  const exploitation = Array.from({ length: 10 }, (_, index) =>
    item(index + 1, "exploitation"),
  );
  const exploration = Array.from({ length: 10 }, (_, index) =>
    item(index + 101, "exploration"),
  );

  const result = mixRecommendationPools(exploitation, exploration, 10, 0.2);

  assert.equal(result.length, 10);
  assert.equal(
    result.filter((candidate) => candidate.pool === "exploration").length,
    2,
  );
  assert.deepEqual(
    result.map((candidate) => candidate.id),
    ["1", "2", "3", "4", "101", "5", "6", "7", "8", "102"],
  );
});

test("recommendation mix uses exploration when exploitation is sparse without exceeding the ceiling", () => {
  const exploitation = [item(1, "exploitation"), item(2, "exploitation")];
  const exploration = Array.from({ length: 10 }, (_, index) =>
    item(index + 101, "exploration"),
  );

  const result = mixRecommendationPools(exploitation, exploration, 10, 0.2);

  assert.equal(result.length, 4);
  assert.equal(
    result.filter((candidate) => candidate.pool === "exploration").length,
    2,
  );
  assert.deepEqual(
    result.map((candidate) => candidate.id),
    ["1", "2", "101", "102"],
  );
});

test("recommendation mix fills the configured exploration allocation when exploitation is insufficient", () => {
  const exploitation = Array.from({ length: 6 }, (_, index) =>
    item(index + 1, "exploitation"),
  );
  const exploration = [item(101, "exploration"), item(102, "exploration")];

  const result = mixRecommendationPools(exploitation, exploration, 8, 0.25);

  assert.equal(result.length, 8);
  assert.equal(
    result.filter((candidate) => candidate.pool === "exploration").length,
    2,
  );
  assert.deepEqual(
    result.map((candidate) => candidate.id),
    ["1", "2", "3", "4", "101", "5", "6", "102"],
  );
});

test("recommendation mix validates its contract", () => {
  assert.throws(
    () => mixRecommendationPools({}, [], 5),
    /pools must be arrays/,
  );

  assert.throws(
    () => mixRecommendationPools([], [], 0),
    /positive integer/,
  );

  assert.throws(
    () => mixRecommendationPools([], [], 5, 1.1),
    /between 0 and 1/,
  );
});
