import test from "node:test";
import assert from "node:assert/strict";

import { scoreCandidate } from "../services/recommendations/recommendationScorer.js";

function historyItem({ id = 1, type = "movie", rating, connections, title = "History" }) {
  return {
    id,
    type,
    title,
    status: "watched",
    rating,
    connections,
  };
}

function candidate({ id = 100, type = "movie", connections, title = "Candidate" }) {
  return {
    id,
    type,
    title,
    connections,
  };
}

function actor(id = "actor-1") {
  return { type: "actor", value: id };
}

test("S-rated history creates positive actor evidence", () => {
  const history = [historyItem({ rating: "S", connections: [actor()] })];
  const result = scoreCandidate(candidate({ connections: [actor()] }), history);

  assert.ok(result.recommendationScore > 0);
  assert.ok(result.strongScore > 0);
});

test("D-rated history creates negative actor evidence", () => {
  const history = [historyItem({ rating: "D", connections: [actor()] })];
  const result = scoreCandidate(candidate({ connections: [actor()] }), history);

  assert.ok(result.recommendationScore < 0);
  assert.ok(result.strongScore < 0);
});

test("C-rated history is neutral and does not create evidence", () => {
  const history = [historyItem({ rating: "C", connections: [actor()] })];
  const result = scoreCandidate(candidate({ connections: [actor()] }), history);

  assert.equal(result.recommendationScore, 0);
  assert.equal(result.strongScore, 0);
  assert.equal(result.sourceCount, 0);
  assert.equal(result.connectionEvidence.length, 0);
});

test("TV actor connections are ignored", () => {
  const history = [
    historyItem({ type: "tv", rating: "S", connections: [actor()] }),
  ];
  const result = scoreCandidate(
    candidate({ type: "tv", connections: [actor()] }),
    history,
  );

  assert.equal(result.recommendationScore, 0);
  assert.equal(result.sourceCount, 0);
  assert.equal(result.connectionEvidence.length, 0);
});

test("movie and TV histories remain isolated", () => {
  const history = [
    historyItem({ type: "tv", rating: "S", connections: [actor("shared")] }),
    historyItem({ type: "movie", rating: "S", connections: [actor("movie")] }),
  ];
  const result = scoreCandidate(
    candidate({ type: "movie", connections: [actor("shared")] }),
    history,
  );

  assert.equal(result.recommendationScore, 0);
  assert.equal(result.sourceCount, 0);
});

test("scoring is deterministic for identical inputs", () => {
  const history = [
    historyItem({ id: 1, rating: "S", connections: [actor("a")] }),
    historyItem({ id: 2, rating: "A", connections: [actor("a")] }),
  ];
  const input = candidate({ connections: [actor("a")] });

  const first = scoreCandidate(input, history);
  const second = scoreCandidate(input, history);

  assert.deepEqual(first, second);
});

test("scores remain finite under repeated evidence", () => {
  const history = Array.from({ length: 100 }, (_, index) =>
    historyItem({
      id: index + 1,
      rating: index % 2 === 0 ? "S" : "D",
      connections: [actor("a")],
    }),
  );
  const result = scoreCandidate(candidate({ connections: [actor("a")] }), history);

  assert.ok(Number.isFinite(result.recommendationScore));
  assert.ok(Number.isFinite(result.strongScore));
  assert.ok(Number.isFinite(result.genreScore));
  assert.ok(Number.isFinite(result.contextScore));
  assert.ok(Number.isFinite(result.historyAnchorScore));
});
