import test from "node:test";
import assert from "node:assert/strict";
import { filterGraphElements } from "../src/pages/network/filterGraphElements.js";

function createFixture() {
  return {
    nodes: [
      { id: "media-movie-1", type: "media" },
      { id: "media-movie-2", type: "media" },
      { id: "connection-actor-a", type: "connection", connectionType: "actor", label: "Actor A", count: 2, connectedMediaIds: ["media-movie-1", "media-movie-2"] },
      { id: "connection-genre-drama", type: "connection", connectionType: "genre", label: "Drama", count: 2, connectedMediaIds: ["media-movie-1", "media-movie-2"] },
    ],
    edges: [
      { id: "e1", source: "media-movie-1", target: "connection-actor-a" },
      { id: "e2", source: "media-movie-2", target: "connection-actor-a" },
      { id: "e3", source: "media-movie-1", target: "connection-genre-drama" },
      { id: "e4", source: "media-movie-2", target: "connection-genre-drama" },
    ],
  };
}

test("filterGraphElements keeps media and only active connection types", () => {
  const result = filterGraphElements(createFixture(), new Set(["actor"]), null);

  assert.deepEqual(result.nodes.map((node) => node.id), [
    "media-movie-1",
    "media-movie-2",
    "connection-actor-a",
  ]);
  assert.deepEqual(result.edges.map((edge) => edge.id), ["e1", "e2"]);
});

test("filterGraphElements focus isolates one connection and its media", () => {
  const fixture = createFixture();
  const connection = fixture.nodes[2];
  const result = filterGraphElements(fixture, new Set(["actor", "genre"]), connection);

  assert.deepEqual(result.nodes.map((node) => node.id), [
    "media-movie-1",
    "media-movie-2",
    "connection-actor-a",
  ]);
  assert.deepEqual(result.edges.map((edge) => edge.id), ["e1", "e2"]);
});

test("filterGraphElements never returns edges with hidden endpoints", () => {
  const fixture = createFixture();
  fixture.edges.push({ id: "invalid", source: "media-movie-1", target: "missing" });

  const result = filterGraphElements(fixture, new Set(["genre"]), null);
  const visibleIds = new Set(result.nodes.map((node) => node.id));

  assert.ok(result.edges.every((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)));
});
