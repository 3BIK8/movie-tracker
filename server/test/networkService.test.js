import test from "node:test";
import assert from "node:assert/strict";
import { buildNetwork } from "../services/recommendations/networkService.js";

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

test("buildNetwork rejects histories above the complete bounded contract", async () => {
  const history = Array.from({ length: 401 }, (_, index) => ({
    type: "movie",
    id: String(index + 1),
  }));

  await assert.rejects(
    () => buildNetwork(history),
    (error) => {
      assert.equal(error.name, "TypeError");
      assert.match(error.message, /400 items/);
      return true;
    },
  );
});
