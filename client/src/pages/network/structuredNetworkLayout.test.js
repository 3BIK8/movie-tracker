import test from "node:test";
import assert from "node:assert/strict";
import { buildStructuredNetworkLayout } from "./structuredNetworkLayout.js";

const nodes = [
  { id: "media-1", type: "media", title: "Alpha" },
  { id: "media-2", type: "media", title: "Beta" },
  { id: "actor-1", type: "connection", connectionType: "actor", label: "Actor", connectedMediaIds: ["media-1", "media-2"] },
  { id: "genre-1", type: "connection", connectionType: "genre", label: "Drama", connectedMediaIds: ["media-1"] },
];

test("structured layout is deterministic", () => {
  const first = buildStructuredNetworkLayout(nodes);
  const second = buildStructuredNetworkLayout([...nodes].reverse());

  assert.deepEqual(first, second);
});

test("media occupy a primary grid", () => {
  const positions = buildStructuredNetworkLayout(nodes);

  assert.deepEqual(positions["media-1"], { x: 0, y: 0 });
  assert.deepEqual(positions["media-2"], { x: 180, y: 0 });
});

test("connections occupy dedicated lanes outside the media grid", () => {
  const positions = buildStructuredNetworkLayout(nodes);

  assert.ok(positions["actor-1"].x > positions["media-2"].x);
  assert.ok(positions["genre-1"].x > positions["actor-1"].x);
});
