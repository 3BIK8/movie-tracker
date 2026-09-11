import test from "node:test";
import assert from "node:assert/strict";
import { buildStructuredNetworkLayout } from "./structuredNetworkLayout.js";

const nodes = [
  { id: "media-1", type: "media", title: "Alpha" },
  { id: "media-2", type: "media", title: "Beta" },
  { id: "media-3", type: "media", title: "Gamma" },
  {
    id: "actor-1",
    type: "connection",
    connectionType: "actor",
    label: "Actor",
    connectedMediaIds: ["media-1", "media-2"],
  },
  {
    id: "genre-1",
    type: "connection",
    connectionType: "genre",
    label: "Drama",
    connectedMediaIds: ["media-2", "media-3"],
  },
];

test("interlocked layout is deterministic", () => {
  const first = buildStructuredNetworkLayout(nodes);
  const second = buildStructuredNetworkLayout([...nodes].reverse());

  assert.deepEqual(first, second);
});

test("media occupy a compact 2D mesh", () => {
  const positions = buildStructuredNetworkLayout(nodes);
  const mediaPositions = [
    positions["media-1"],
    positions["media-2"],
    positions["media-3"],
  ];

  assert.ok(new Set(mediaPositions.map(({ x }) => x)).size > 1);
  assert.ok(new Set(mediaPositions.map(({ y }) => y)).size > 1);
});

test("shared connections are positioned near their movie neighborhood", () => {
  const positions = buildStructuredNetworkLayout(nodes);
  const actor = positions["actor-1"];
  const genre = positions["genre-1"];

  assert.ok(actor.x >= Math.min(positions["media-1"].x, positions["media-2"].x) - 100);
  assert.ok(actor.x <= Math.max(positions["media-1"].x, positions["media-2"].x) + 100);
  assert.ok(genre.x >= Math.min(positions["media-2"].x, positions["media-3"].x) - 100);
  assert.ok(genre.x <= Math.max(positions["media-2"].x, positions["media-3"].x) + 100);
});
