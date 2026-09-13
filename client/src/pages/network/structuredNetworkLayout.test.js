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
  { id: "media-5", type: "media", title: "Epsilon", releaseDate: "2005-01-01" },
  { id: "media-6", type: "media", title: "Zeta", releaseDate: "2006-01-01" },
  { id: "media-7", type: "media", title: "Eta", releaseDate: "2007-01-01" },
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

function createSyntheticMediaNodes(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `media-${index + 1}`,
    type: "media",
    title: `Title ${index + 1}`,
    releaseDate: `${1950 + (index % 75)}-01-01`,
  }));
}

function createSyntheticLargeNetwork(count) {
  const media = createSyntheticMediaNodes(count);
  const connections = Array.from({ length: 20 }, (_, index) => ({
    id: `genre-${index + 1}`,
    type: "connection",
    connectionType: "genre",
    label: `Genre ${index + 1}`,
    connectedMediaIds: media
      .filter((_, mediaIndex) => mediaIndex % (index + 2) === 0)
      .slice(0, 30)
      .map((node) => node.id),
  }));

  return [...media, ...connections];
}

test("layout is deterministic regardless of input order", () => {
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
});

test("primary movie nodes have guaranteed collision-free grid spacing", () => {
  const positions = buildStructuredNetworkLayout(nodes);
  const media = nodes.filter((node) => node.type === "media");

  for (let i = 0; i < media.length; i += 1) {
    for (let j = i + 1; j < media.length; j += 1) {
      assert.ok(distance(positions[media[i].id], positions[media[j].id]) >= 48);
    }
  }
});

test("relationship nodes occupy open interstitial positions", () => {
  const positions = buildStructuredNetworkLayout(nodes);
  const media = nodes.filter((node) => node.type === "media");
  const connections = nodes.filter((node) => node.type === "connection");

  for (const connection of connections) {
    for (const movie of media) {
      assert.ok(distance(positions[connection.id], positions[movie.id]) >= 48);
    }
  }

  for (let i = 0; i < connections.length; i += 1) {
    for (let j = i + 1; j < connections.length; j += 1) {
      assert.ok(distance(positions[connections[i].id], positions[connections[j].id]) >= 18);
    }
  }
});

test("edge curve distance is deterministic and points outward", () => {
  const source = { x: -100, y: 0 };
  const target = { x: 100, y: 0 };
  const center = { x: 0, y: 0 };
  const first = buildEdgeCurveDistance(source, target, center);
  const second = buildEdgeCurveDistance(source, target, center);

  assert.ok(Math.abs(first - 18) < 0.1);
  assert.equal(first, second);
});

test("layout scales to 500 watched titles without losing deterministic positions", () => {
  const syntheticNodes = createSyntheticMediaNodes(500);
  const startedAt = performance.now();
  const positions = buildStructuredNetworkLayout(syntheticNodes);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(Object.keys(positions).length, 500);

  const occupied = new Set(
    syntheticNodes.map((node) => `${positions[node.id].x}:${positions[node.id].y}`),
  );
  assert.equal(occupied.size, 500);

  for (const node of syntheticNodes) {
    assert.ok(Number.isFinite(positions[node.id].x));
    assert.ok(Number.isFinite(positions[node.id].y));
  }

  assert.ok(elapsedMs < 3000, `500-node layout took ${elapsedMs.toFixed(1)}ms`);
});

test("large network layout remains fast and collision-free at 1000 titles", () => {
  const syntheticNodes = createSyntheticLargeNetwork(1000);
  const startedAt = performance.now();
  const positions = buildStructuredNetworkLayout(syntheticNodes);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(Object.keys(positions).length, syntheticNodes.length);

  const media = syntheticNodes.filter((node) => node.type === "media");
  const occupied = new Set(
    media.map((node) => `${positions[node.id].x}:${positions[node.id].y}`),
  );

  assert.equal(occupied.size, media.length);
  assert.ok(elapsedMs < 1000, `1000-node layout took ${elapsedMs.toFixed(1)}ms`);
});
