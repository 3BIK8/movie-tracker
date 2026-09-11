import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEdgeCurveDistance,
  buildStructuredNetworkLayout,
} from "./structuredNetworkLayout.js";

const nodes = [
  { id: "media-1", type: "media", title: "Alpha", releaseDate: "2001-01-01" },
  { id: "media-2", type: "media", title: "Beta", releaseDate: "2002-01-01" },
  { id: "media-3", type: "media", title: "Gamma", releaseDate: "2003-01-01" },
  { id: "media-4", type: "media", title: "Delta", releaseDate: "2004-01-01" },
  {
    id: "actor-1",
    type: "connection",
    connectionType: "actor",
    label: "Actor",
    connectedMediaIds: ["media-1", "media-2", "media-3"],
  },
  {
    id: "director-1",
    type: "connection",
    connectionType: "director",
    label: "Director",
    connectedMediaIds: ["media-1", "media-2"],
  },
  {
    id: "genre-1",
    type: "connection",
    connectionType: "genre",
    label: "Drama",
    connectedMediaIds: ["media-2", "media-3", "media-4"],
  },
  {
    id: "studio-1",
    type: "connection",
    connectionType: "studio",
    label: "Studio",
    connectedMediaIds: ["media-3", "media-4"],
  },
];

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

test("HCCT layout is deterministic regardless of input order", () => {
  const first = buildStructuredNetworkLayout(nodes);
  const second = buildStructuredNetworkLayout([...nodes].reverse());

  assert.deepEqual(first, second);
});

test("every watched title receives a finite 2D position", () => {
  const positions = buildStructuredNetworkLayout(nodes);

  for (const node of nodes.filter((node) => node.type === "media")) {
    assert.ok(Number.isFinite(positions[node.id].x));
    assert.ok(Number.isFinite(positions[node.id].y));
  }

  assert.ok(new Set(nodes.slice(0, 4).map((node) => positions[node.id].x)).size > 1);
  assert.ok(new Set(nodes.slice(0, 4).map((node) => positions[node.id].y)).size > 1);
});

test("movie mesh stays within the intended wide aspect envelope", () => {
  const positions = buildStructuredNetworkLayout(nodes);
  const mediaPositions = nodes
    .filter((node) => node.type === "media")
    .map((node) => positions[node.id]);
  const width = Math.max(...mediaPositions.map((point) => point.x)) - Math.min(...mediaPositions.map((point) => point.x));
  const height = Math.max(...mediaPositions.map((point) => point.y)) - Math.min(...mediaPositions.map((point) => point.y));

  assert.ok(width > 0);
  assert.ok(height > 0);
  assert.ok(width / height >= 1.1);
});

test("relationship nodes stay outside movie slots and inside their neighborhood", () => {
  const positions = buildStructuredNetworkLayout(nodes);

  for (const connection of nodes.filter((node) => node.type === "connection")) {
    const connectionPosition = positions[connection.id];
    for (const media of nodes.filter((node) => node.type === "media")) {
      assert.ok(distance(connectionPosition, positions[media.id]) > 20);
    }

    const connectedPositions = connection.connectedMediaIds.map((id) => positions[id]);
    const minX = Math.min(...connectedPositions.map((point) => point.x)) - 160;
    const maxX = Math.max(...connectedPositions.map((point) => point.x)) + 160;
    const minY = Math.min(...connectedPositions.map((point) => point.y)) - 160;
    const maxY = Math.max(...connectedPositions.map((point) => point.y)) + 160;

    assert.ok(connectionPosition.x >= minX && connectionPosition.x <= maxX);
    assert.ok(connectionPosition.y >= minY && connectionPosition.y <= maxY);
  }
});

test("edge curve distance is deterministic and points outward", () => {
  const source = { x: -100, y: 0 };
  const target = { x: 100, y: 0 };
  const center = { x: 0, y: 0 };

  assert.equal(buildEdgeCurveDistance(source, target, center), 18);
  assert.equal(
    buildEdgeCurveDistance(source, target, center),
    buildEdgeCurveDistance(source, target, center),
  );
});
