import test from "node:test";
import assert from "node:assert/strict";
import { NETWORK_STYLES } from "../src/pages/network/networkStyles.js";

function getStyle(selector) {
  return NETWORK_STYLES.find((entry) => entry.selector === selector)?.style;
}

test("filtered network nodes stay in Cytoscape and become non-interactive", () => {
  assert.deepEqual(getStyle("node.filtered-out"), { opacity: 0, label: "", events: "no" });
});

test("filtered network edges stay in Cytoscape without contributing visible opacity", () => {
  assert.deepEqual(getStyle("edge.filtered-out"), { opacity: 0 });
});

test("Network uses a visual z-index sandwich", () => {
  assert.equal(getStyle("edge")["z-index"], 1);
  assert.equal(getStyle("node[type='connection']")["z-index"], 2);
  assert.equal(getStyle("node[type='media']")["z-index"], 3);
});

test("Network uses compact primary and micro metadata nodes", () => {
  assert.equal(getStyle("node[type='media']").width, 18);
  assert.equal(getStyle("node[type='media']").height, 18);
  assert.equal(getStyle("node[type='connection']").width, 5);
  assert.equal(getStyle("node[type='connection']").height, 5);
  assert.ok(getStyle("edge").opacity <= 0.15);
});

test("filtered selectors are applied after interaction styles", () => {
  const filteredNodeIndex = NETWORK_STYLES.findIndex((entry) => entry.selector === "node.filtered-out");
  const highlightedNodeIndex = NETWORK_STYLES.findIndex((entry) => entry.selector === ".highlighted");
  const filteredEdgeIndex = NETWORK_STYLES.findIndex((entry) => entry.selector === "edge.filtered-out");
  const highlightedEdgeIndex = NETWORK_STYLES.findIndex((entry) => entry.selector === "edge.highlighted");

  assert.ok(filteredNodeIndex > highlightedNodeIndex);
  assert.ok(filteredEdgeIndex > highlightedEdgeIndex);
});
