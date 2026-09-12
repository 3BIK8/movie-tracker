import test from "node:test";
import assert from "node:assert/strict";
import { filterGraphElements } from "./filterGraphElements.js";

const networkData = {
  nodes: [
    { id: "media-movie-1", type: "media" },
    { id: "actor-1", type: "connection", connectionType: "actor", connectedMediaIds: ["media-movie-1"] },
    { id: "keyword-1", type: "connection", connectionType: "keyword", connectedMediaIds: ["media-movie-1"] },
    { id: "genre-1", type: "connection", connectionType: "genre", connectedMediaIds: ["media-movie-1"] },
  ],
  edges: [
    { id: "media-movie-1->actor-1", source: "media-movie-1", target: "actor-1" },
    { id: "media-movie-1->keyword-1", source: "media-movie-1", target: "keyword-1" },
    { id: "media-movie-1->genre-1", source: "media-movie-1", target: "genre-1" },
  ],
};

test("network projection excludes unselected connection types", () => {
  const result = filterGraphElements(networkData, new Set(["actor", "genre"]), null);

  assert.deepEqual(
    result.nodes.map((node) => node.id),
    ["media-movie-1", "actor-1", "genre-1"],
  );
  assert.deepEqual(
    result.edges.map((edge) => edge.id),
    ["media-movie-1->actor-1", "media-movie-1->genre-1"],
  );
});

test("metadata visibility leaves the complete media backbone", () => {
  const result = filterGraphElements(networkData, new Set(), null, false);
  assert.deepEqual(result.nodes.map((node) => node.id), ["media-movie-1"]);
  assert.deepEqual(result.edges, []);
});

test("focused connection projection contains only its neighborhood", () => {
  const result = filterGraphElements(
    networkData,
    new Set(["actor", "genre", "keyword"]),
    networkData.nodes[1],
  );

  assert.deepEqual(
    result.nodes.map((node) => node.id),
    ["media-movie-1", "actor-1"],
  );
  assert.deepEqual(result.edges.map((edge) => edge.id), ["media-movie-1->actor-1"]);
});
