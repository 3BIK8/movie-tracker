import test from "node:test";
import assert from "node:assert/strict";
import { NETWORK_STYLES } from "../src/pages/network/networkStyles.js";

function getStyle(selector) {
  return NETWORK_STYLES.find((entry) => entry.selector === selector)?.style;
}

test("filtered network nodes stay in Cytoscape and become non-interactive", () => {
  const style = getStyle("node.filtered-out");

  assert.deepEqual(style, {
    opacity: 0,
    label: "",
    events: "no",
  });
});

test("filtered network edges stay in Cytoscape without contributing visible opacity", () => {
  const style = getStyle("edge.filtered-out");

  assert.deepEqual(style, {
    opacity: 0,
  });
});

test("filtered selectors are applied after interaction styles", () => {
  const filteredNodeIndex = NETWORK_STYLES.findIndex(
    (entry) => entry.selector === "node.filtered-out",
  );
  const highlightedNodeIndex = NETWORK_STYLES.findIndex(
    (entry) => entry.selector === ".highlighted",
  );
  const filteredEdgeIndex = NETWORK_STYLES.findIndex(
    (entry) => entry.selector === "edge.filtered-out",
  );
  const highlightedEdgeIndex = NETWORK_STYLES.findIndex(
    (entry) => entry.selector === "edge.highlighted",
  );

  assert.ok(filteredNodeIndex > highlightedNodeIndex);
  assert.ok(filteredEdgeIndex > highlightedEdgeIndex);
});
