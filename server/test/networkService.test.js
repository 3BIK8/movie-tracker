import test from "node:test";
import assert from "node:assert/strict";
import { validateNetworkHistory, buildNetwork } from "../services/recommendations/networkService.js";

test("buildNetwork accepts an empty history without external enrichment", async () => {
  const result = await buildNetwork([]);

  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.edges, []);
  assert.equal(result.meta.requestedMedia, 0);
  assert.equal(result.meta.enrichedMedia, 0);
  assert.equal(result.meta.movieMedia, 0);
  assert.equal(result.meta.tvMedia, 0);
  assert.equal(result.meta.mediaNodeCount, 0);
  assert.equal(result.meta.connectionNodeCount, 0);
  assert.equal(result.meta.nodeCount, 0);
  assert.equal(result.meta.edgeCount, 0);
  assert.equal(result.meta.personalizedConnections, 0);
  assert.equal(typeof result.meta.buildMs, "number");
});

test("validateNetworkHistory accepts a history larger than 400 items", () => {
  const history = Array.from({ length: 501 }, (_, index) => ({
    type: index % 2 === 0 ? "movie" : "tv",
    id: String(index + 1),
  }));

  const normalized = validateNetworkHistory(history);

  assert.equal(normalized.length, 501);
  assert.equal(normalized[0].id, "1");
  assert.equal(normalized.at(-1).id, "501");
});

test("validateNetworkHistory still deduplicates canonical media identities", () => {
  const normalized = validateNetworkHistory([
    { type: "movie", id: 10 },
    { type: "movie", id: "10" },
    { type: "tv", id: 10 },
  ]);

  assert.equal(normalized.length, 2);
  assert.deepEqual(
    normalized.map((item) => `${item.type}:${item.id}`),
    ["movie:10", "tv:10"],
  );
});
