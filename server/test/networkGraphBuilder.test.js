import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, NETWORK_GRAPH_LIMITS } from "../services/recommendations/graphBuilder.js";

function record(id, connections) {
  return {
    mediaNode: {
      id: `media-movie-${id}`,
      type: "media",
      mediaType: "movie",
      title: `Movie ${id}`,
    },
    connections,
  };
}

function connection(type, value, label = value) {
  return { type, value, label };
}

test("buildGraph creates a deterministic bipartite graph", () => {
  const records = [
    record("2", [connection("actor", "10", "Actor A")]),
    record("1", [connection("actor", "10", "Actor A")]),
  ];

  const graph = buildGraph(records);

  assert.deepEqual(graph.nodes.map((node) => node.id), [
    "media-movie-2",
    "media-movie-1",
    "connection-actor-10",
  ]);

  assert.equal(graph.edges.length, 2);
  assert.ok(graph.edges.every((edge) => edge.source.startsWith("media-")));
  assert.ok(graph.edges.every((edge) => edge.target.startsWith("connection-")));
  assert.equal(graph.nodes.at(-1).count, 2);
  assert.deepEqual(graph.nodes.at(-1).connectedMediaIds, [
    "media-movie-1",
    "media-movie-2",
  ]);
});

test("buildGraph removes duplicate connections within a media record", () => {
  const graph = buildGraph([
    record("1", [
      connection("genre", "18", "Drama"),
      connection("genre", "18", "Drama"),
    ]),
    record("2", [connection("genre", "18", "Drama")]),
  ]);

  assert.equal(graph.nodes.filter((node) => node.type === "connection").length, 1);
  assert.equal(graph.edges.length, 2);
});

test("buildGraph excludes connections that occur in only one media item", () => {
  const graph = buildGraph([
    record("1", [connection("actor", "10")]),
    record("2", [connection("actor", "20")]),
  ]);

  assert.equal(graph.nodes.filter((node) => node.type === "connection").length, 0);
  assert.equal(graph.edges.length, 0);
});

test("buildGraph stays within topology limits", () => {
  const records = Array.from({ length: 180 }, (_, index) =>
    record(String(index + 1), [
      ...Array.from({ length: 45 }, (_, connectionIndex) =>
        connection("keyword", String(connectionIndex + 1)),
      ),
    ]),
  );

  const graph = buildGraph(records);
  const connectionNodes = graph.nodes.filter((node) => node.type === "connection");

  assert.ok(connectionNodes.length <= NETWORK_GRAPH_LIMITS.maxConnectionNodes);
  assert.ok(graph.edges.length <= NETWORK_GRAPH_LIMITS.maxEdges);
  assert.ok(
    connectionNodes.every(
      (node) => node.connectedMediaIds.length <= NETWORK_GRAPH_LIMITS.maxMediaPerConnection,
    ),
  );
  assert.ok(graph.edges.every((edge) => edge.source !== edge.target));
});
