import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRetrievalStageComparison,
  evaluateTemporalCandidateRetrieval,
  getCandidateKeys,
} from "../services/recommendations/candidateRetrievalEvaluation.js";

function historyItem(id, timestamp, rating = "S") {
  return {
    id,
    type: "movie",
    status: "watched",
    rating,
    updatedAt: timestamp,
  };
}

function candidate(id, sources = ["actors"]) {
  return {
    id,
    type: "movie",
    sources: sources.map((type) => ({ type, value: `${type}-${id}` })),
  };
}

const history = [
  historyItem("1", "2025-01-01T00:00:00Z"),
  historyItem("2", "2025-02-01T00:00:00Z"),
  historyItem("3", "2025-03-01T00:00:00Z"),
  historyItem("4", "2025-04-01T00:00:00Z"),
  historyItem("5", "2025-05-01T00:00:00Z"),
];

test("temporal retrieval evaluation hides future positives from retrieval", async () => {
  let receivedHistory;
  let receivedRelevantIds;

  const result = await evaluateTemporalCandidateRetrieval({
    history,
    mediaType: "movie",
    holdoutOptions: {
      testFraction: 0.4,
      minTrainInteractions: 3,
      minTestInteractions: 1,
    },
    retrieveCandidates: async ({ history: trainHistory, relevantIds }) => {
      receivedHistory = trainHistory;
      receivedRelevantIds = relevantIds;
      return [candidate("4"), candidate("9")];
    },
  });

  assert.equal(result.evaluated, true);
  assert.deepEqual(receivedHistory.map((item) => item.id), ["1", "2", "3"]);
  assert.deepEqual([...receivedRelevantIds], ["movie:4", "movie:5"]);
  assert.equal(result.stages[0].recall, 1 / 2);
  assert.equal(result.stages[0].coveredRelevantCount, 1);
});

test("retrieval evaluation can compare direct and multi-hop stages", async () => {
  const result = await evaluateTemporalCandidateRetrieval({
    history,
    mediaType: "movie",
    holdoutOptions: {
      testFraction: 0.4,
      minTrainInteractions: 3,
      minTestInteractions: 1,
    },
    retrieveCandidates: async () => ({
      direct: [candidate("4", ["actors"]), candidate("9")],
      multiHop: [candidate("4", ["actors", "multiHop"]), candidate("5", ["multiHop"])],
    }),
  });

  const comparison = buildRetrievalStageComparison(result.stages);

  assert.equal(comparison[0].name, "multiHop");
  assert.equal(comparison[0].recall, 1);
  assert.equal(comparison[1].name, "direct");
  assert.equal(comparison[1].recall, 1 / 2);
});

test("retrieval evaluation reports insufficient histories without invoking retrieval", async () => {
  let invoked = false;

  const result = await evaluateTemporalCandidateRetrieval({
    history: [historyItem("1", "2025-01-01T00:00:00Z")],
    mediaType: "movie",
    retrieveCandidates: async () => {
      invoked = true;
      return [];
    },
  });

  assert.equal(result.evaluated, false);
  assert.equal(invoked, false);
  assert.equal(result.reason, "insufficient-timestamped-history");
});

test("candidate keys provide stable type-aware identity", () => {
  assert.deepEqual(
    [...getCandidateKeys([candidate("1"), { ...candidate("1"), type: "tv" }])],
    ["movie:1", "tv:1"],
  );
});
