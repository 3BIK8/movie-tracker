import test from "node:test";
import assert from "node:assert/strict";

test("network graph lifecycle guards fit operations until layout settles", () => {
  const lifecycle = {
    layoutActive: true,
    pendingFit: null,
  };

  const fit = () => {
    lifecycle.pendingFit = true;
  };

  if (lifecycle.layoutActive) {
    lifecycle.pendingFit = fit;
  } else {
    fit();
  }

  assert.equal(lifecycle.pendingFit !== null, true);

  lifecycle.layoutActive = false;
  const pendingFit = lifecycle.pendingFit;
  lifecycle.pendingFit = null;
  pendingFit();

  assert.equal(lifecycle.pendingFit, true);
});
