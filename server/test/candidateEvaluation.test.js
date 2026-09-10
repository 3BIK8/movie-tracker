import test from "node:test";
import assert from "node:assert/strict";
import {
  candidateRecall,
  candidateSourceRecall,
  evaluateCandidateRetrieval,
} from "../services/recommendations/candidateEvaluation.js";

function candidate(id, sources) {
  return {
    id,
    type: "movie",
    sources: sources.map((type) => ({ type, value: `${type}-${id}` })),
  };
}

const relevantIds = new Set(["movie:1", "movie:2", "movie:3"]);
const candidates = [
  candidate("1", ["actors"]),
  candidate("2", ["actors", "genres"]),
  candidate("4", ["keywords"]),
];

test("candidate recall measures retrieval coverage before ranking", () => {
  assert.equal(candidateRecall(candidates, relevantIds), 2 / 3);
});

test("source recall exposes overlap and unique retrieval contribution", () => {
  const stats = candidateSourceRecall(candidates, relevantIds);

  assert.equal(stats.actors.hits, 2);
  assert.equal(stats.actors.uniqueHits, 1);
  assert.equal(stats.genres.hits, 1);
  assert.equal(stats.genres.uniqueHits, 0);
  assert.equal(stats.actors.marginalRecall, 1 / 3);
});

test("candidate retrieval evaluation returns auditable counts", () => {
  assert.deepEqual(
    evaluateCandidateRetrieval({ candidates, relevantIds }),
    {
      candidateCount: 3,
      relevantCount: 3,
      coveredRelevantCount: 2,
      recall: 2 / 3,
      sourceRecall: {
        actors: {
          hits: 2,
          uniqueHits: 1,
          recall: 2 / 3,
          marginalRecall: 1 / 3,
        },
        genres: {
          hits: 1,
          uniqueHits: 0,
          recall: 1 / 3,
          marginalRecall: 0,
        },
      },
    },
  );
});
