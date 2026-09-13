import test from "node:test";
import assert from "node:assert/strict";
import { searchNetworkMedia } from "./networkMediaSearch.js";

test("searchNetworkMedia ranks prefix matches before substring matches", () => {
  const nodes = [
    { id: "media-1", type: "media", title: "The Batman" },
    { id: "media-2", type: "media", title: "Batman Begins" },
    { id: "media-3", type: "media", title: "Batman" },
  ];

  assert.deepEqual(
    searchNetworkMedia(nodes, "batman", 3).map((node) => node.id),
    ["media-3", "media-2", "media-1"],
  );
});

test("searchNetworkMedia ignores non-media nodes and applies a limit", () => {
  const nodes = [
    { id: "genre-1", type: "connection", label: "Action" },
    { id: "media-1", type: "media", title: "Alien" },
    { id: "media-2", type: "media", title: "Aliens" },
  ];

  assert.deepEqual(
    searchNetworkMedia(nodes, "ali", 1).map((node) => node.id),
    ["media-1"],
  );
});
