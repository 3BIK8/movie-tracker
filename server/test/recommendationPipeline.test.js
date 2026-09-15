import test from "node:test";
import assert from "node:assert/strict";

import { rankCandidates } from "../services/recommendations/recommendationScorer.js";
import { isValidCandidate } from "../services/recommendations/candidateFilter.js";

function connection(type, value) {
  return { type, value };
}

function watched(type, id, rating, connections) {
  return {
    type,
    id: String(id),
    status: "watched",
    rating,
    title: `${type}-${id}`,
    connections,
  };
}

test("a shared actor connection provides only a supporting signal", () => {
  const history = [
    watched("movie", 1, "S", [connection("actor", "actor-1")]),
  ];

  const candidates = [
    {
      type: "movie",
      id: "2",
      title: "Shared Actor",
      connections: [connection("actor", "actor-1")],
    },
    {
      type: "movie",
      id: "3",
      title: "Unrelated",
      connections: [connection("genre", "18")],
    },
  ];

  const ranked = rankCandidates(candidates, history);

  assert.equal(ranked[0].id, "2");
  assert.ok(ranked[0].recommendationScore > ranked[1].recommendationScore);
  assert.equal(ranked[0].strongScore, 0);
});

test("watched items remain excluded by candidate filtering when the caller applies known-id filtering", () => {
  const history = [watched("movie", 123, "S", [connection("actor", "a")])];
  const knownKeys = new Set(history.map((item) => `${item.type}:${item.id}`));

  const candidates = [
    { type: "movie", id: "123", title: "Already watched", connections: [] },
    { type: "movie", id: "456", title: "New", connections: [] },
  ];

  const unseen = candidates.filter(
    (candidate) => !knownKeys.has(`${candidate.type}:${candidate.id}`),
  );

  assert.deepEqual(unseen.map((candidate) => candidate.id), ["456"]);
});

test("movie and TV histories remain isolated", () => {
  const history = [
    watched("movie", 123, "S", [connection("actor", "shared")]),
  ];

  const candidates = [
    {
      type: "tv",
      id: "123",
      title: "TV candidate",
      connections: [connection("actor", "shared")],
    },
    {
      type: "movie",
      id: "124",
      title: "Movie candidate",
      connections: [connection("actor", "shared")],
    },
  ];

  const ranked = rankCandidates(candidates, history);

  assert.equal(ranked[0].id, "124");
  assert.equal(ranked[1].id, "123");
  assert.equal(ranked[1].strongScore, 0);
});

test("actors and directors are not primary TV personalization signals", () => {
  const history = [
    watched("tv", 1, "S", [
      connection("actor", "actor-1"),
      connection("director", "director-1"),
    ]),
  ];

  const candidates = [
    {
      type: "tv",
      id: "2",
      title: "Actor match",
      connections: [connection("actor", "actor-1")],
    },
    {
      type: "tv",
      id: "3",
      title: "Director match",
      connections: [connection("director", "director-1")],
    },
  ];

  const ranked = rankCandidates(candidates, history);

  for (const candidate of ranked) {
    assert.equal(candidate.strongScore, 0);
  }
});

test("studio evidence cannot create a hard negative", () => {
  const history = [
    watched("movie", 1, "D", [connection("studio", "studio-1")]),
    watched("movie", 2, "D", [connection("studio", "studio-1")]),
  ];

  const candidate = {
    type: "movie",
    id: "3",
    title: "Same Studio",
    connections: [connection("studio", "studio-1")],
  };

  const [ranked] = rankCandidates([candidate], history);

  assert.equal(ranked.hardNegative, false);
  assert.equal(ranked.strongScore, 0);
  assert.equal(ranked.sourceCount, 0);
});

test("negative-only history remains finite and does not produce NaN or Infinity", () => {
  const history = [
    watched("movie", 1, "D", [connection("director", "director-1")]),
  ];

  const [ranked] = rankCandidates(
    [
      {
        type: "movie",
        id: "2",
        title: "Negative match",
        connections: [connection("director", "director-1")],
      },
    ],
    history,
  );

  assert.equal(Number.isFinite(ranked.recommendationScore), true);
  assert.equal(Number.isFinite(ranked.positiveScore), true);
  assert.equal(Number.isFinite(ranked.negativeScore), true);
});

test("candidate filtering rejects unsupported media and excluded TV genres", () => {
  assert.equal(isValidCandidate({ type: "person", id: 1 }), false);
  assert.equal(
    isValidCandidate({ type: "tv", id: 1, genre_ids: [10763] }),
    false,
  );
  assert.equal(
    isValidCandidate({ type: "movie", id: 1, genre_ids: [18] }),
    true,
  );
});
