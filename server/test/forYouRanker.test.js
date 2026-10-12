import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInterestVectors,
  assignEmbeddingClusters,
  generateEmbeddingCandidates,
} from "../services/forYou/forYouCandidateService.js";
import {
  diversifyWithEmbeddingMmr,
  scoreForYouCandidates,
} from "../services/forYou/forYouRanker.js";

test("For You retrieval filters library and rejection leakage", () => {
  const result = generateEmbeddingCandidates({
    embeddings: [
      { type: "movie", id: "1", vector: new Float32Array([1, 0]) },
      { type: "movie", id: "2", vector: new Float32Array([0.9, 0.1]) },
      { type: "movie", id: "3", vector: new Float32Array([0, 1]) },
    ],
    queryVectors: [new Float32Array([1, 0])],
    libraryKeys: new Set(["movie:1"]),
    rejectionKeys: new Set(["movie:2"]),
    minimumSimilarity: 0,
  });

  test("For You preserves media type identity from embeddings through candidates", () => {
    const result = generateEmbeddingCandidates({
      embeddings: [
        { type: "movie", id: "268", title: "Batman", vector: new Float32Array([1, 0]) },
        { type: "tv", id: "33946", title: "The Batman", vector: new Float32Array([0.99, 0.01]) },
      ],
      queryVectors: [new Float32Array([1, 0])],
    });
    assert.deepEqual(result.map(({ type, id, title }) => ({ type, id, title })), [
      { type: "movie", id: "268", title: "Batman" },
      { type: "tv", id: "33946", title: "The Batman" },
    ]);
  });

  test("For You applies the requested movie and TV ratio", () => {
    const candidates = [
      { type: "movie", id: "1", score: 1, vector: new Float32Array([1, 0]) },
      { type: "movie", id: "2", score: 0.99, vector: new Float32Array([0.99, 0.01]) },
      { type: "movie", id: "3", score: 0.98, vector: new Float32Array([0.98, 0.02]) },
      { type: "tv", id: "4", score: 0.7, vector: new Float32Array([0, 1]) },
      { type: "tv", id: "5", score: 0.69, vector: new Float32Array([0.01, 0.99]) },
    ];
    const ranked = diversifyWithEmbeddingMmr(candidates, 4, 0.72, { movieShare: 0.5 });
    assert.equal(ranked.filter((item) => item.type === "movie").length, 2);
    assert.equal(ranked.filter((item) => item.type === "tv").length, 2);
  });
  assert.deepEqual(result.map((item) => item.id), ["3"]);
});

test("For You ranker combines positive, negative, quality, and fatigue signals", () => {
  const ranked = scoreForYouCandidates([
    { type: "movie", id: "1", vector: new Float32Array([1, 0]), tmdbRating: 8 },
    { type: "movie", id: "2", vector: new Float32Array([0, 1]), tmdbRating: 9 },
  ], {
    longVector: new Float32Array([1, 0]),
    rejectedVectors: [new Float32Array([0, 1])],
    exposureCounts: { "movie:1": 5 },
  });
  assert.equal(ranked[0].id, "1");
  assert.ok(ranked[0].scoreBreakdown.fatigue > 0);
  assert.ok(ranked[1].scoreBreakdown.negativePenalty > 0);
});

test("interest vectors and MMR preserve more than one cluster", () => {
  const interests = buildInterestVectors([
    new Float32Array([1, 0]),
    new Float32Array([0.99, 0.01]),
    new Float32Array([0, 1]),
  ], 2);
  const clustered = assignEmbeddingClusters([
    { id: "a", vector: new Float32Array([1, 0]) },
    { id: "b", vector: new Float32Array([0.99, 0.01]) },
    { id: "c", vector: new Float32Array([0, 1]) },
  ], 2);
  assert.equal(new Set(clustered.map((item) => item.clusterId)).size, 2);
  const ranked = diversifyWithEmbeddingMmr([
    { id: "a", score: 1, clusterId: 1, vector: new Float32Array([1, 0]) },
    { id: "b", score: 0.99, clusterId: 1, vector: new Float32Array([0.99, 0.01]) },
    { id: "c", score: 0.8, clusterId: 2, vector: new Float32Array([0, 1]) },
  ], 2);
  assert.equal(interests.length, 2);
  assert.deepEqual(ranked.map((item) => item.id), ["a", "c"]);
});

test("TMDB seed adapter combines recommendations and similar sources", async () => {
  const seeded = await (await import("../services/forYou/forYouCandidateService.js")).seedFromTmdbConnections({
    mediaType: "movie",
    seedIds: ["1"],
    fetchRecommendations: async () => [{ id: "2" }],
    fetchSimilar: async () => [{ id: "3" }],
  });
  assert.deepEqual(seeded.map((item) => item.source), ["tmdb_related", "tmdb_related"]);
});
