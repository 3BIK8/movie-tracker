import test from "node:test";
import assert from "node:assert/strict";
import { buildNetwork } from "../services/recommendations/networkService.js";

test("buildNetwork accepts an empty history without external enrichment", async () => {
  const result = await buildNetwork([]);

  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.edges, []);
  assert.deepEqual(result.meta, {
    requestedMedia: 0,
    enrichedMedia: 0,
    nodeCount: 0,
    edgeCount: 0,
    buildMs: result.meta.buildMs,
  });
});

test("buildNetwork rejects histories above the transport contract limit", async () => {
  const history = Array.from({ length: 181 }, (_, index) => ({
    type: "movie",
    id: String(index + 1),
  }));

  await assert.rejects(
    () => buildNetwork(history),
    (error) => {
      assert.equal(error.name, "TypeError");
      assert.match(error.message, /180 items/);
      return true;
    },
  );
});

test("buildNetwork canonicalizes duplicate media references", async () => {
  const result = await buildNetwork([
    { type: "movie", id: "001" },
    { type: "movie", id: "1" },
  ]);

  assert.equal(result.meta.requestedMedia, 1);
});
