import test from "node:test";
import assert from "node:assert/strict";
import {
  MULTI_HOP_RETRIEVAL_LIMITS,
  getSecondOrderConnections,
  selectMultiHopBridges,
} from "../services/recommendations/multiHopCandidateRetrieval.js";

test("multi-hop retrieval has explicit bounded bridge and connection budgets", () => {
  assert.equal(MULTI_HOP_RETRIEVAL_LIMITS.maxBridgeCandidates, 12);
  assert.equal(MULTI_HOP_RETRIEVAL_LIMITS.maxConnectionsPerBridge, 3);
});

test("multi-hop bridge selection is deterministic and favors independent sources", () => {
  const candidates = Array.from({ length: 14 }, (_, index) => ({
    id: String(index),
    type: "movie",
    sources:
      index < 2
        ? [
            { type: "actors", value: `actor-${index}`, evidenceScore: 1 },
            { type: "genres", value: `genre-${index}`, evidenceScore: 1 },
          ]
        : [{ type: "genres", value: `genre-${index}`, evidenceScore: 1 }],
  }));

  const selected = selectMultiHopBridges(candidates);

  assert.equal(selected.length, 12);
  assert.deepEqual(
    selected.slice(0, 2).map((candidate) => candidate.id),
    ["0", "1"],
  );
});

test("second-order connections prioritize supported relationship types before filling the bound", () => {
  const metadata = {
    actors: [
      { id: 10, name: "Actor" },
      { id: 11, name: "Actor 2" },
    ],
    directors: [{ id: 20, name: "Director" }],
    genres: [{ id: 30, name: "Genre" }],
    keywords: [{ id: 40, name: "Keyword" }],
    franchises: [{ id: 50, name: "Franchise" }],
    studios: [{ id: 60, name: "Studio" }],
    year: 2020,
    language: "en",
    type: "movie",
  };

  const connections = getSecondOrderConnections(metadata);

  assert.equal(connections.length, 3);
  assert.deepEqual(
    connections.map((connection) => `${connection.type}:${connection.value}`),
    ["actor:10", "franchise:50", "genre:30"],
  );
  assert.equal(connections.some((connection) => connection.type === "director"), false);
  assert.equal(connections.some((connection) => connection.type === "studio"), false);
});
