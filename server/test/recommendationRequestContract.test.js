import test from "node:test";
import assert from "node:assert/strict";

const HISTORY_BYTES = 56 * 1024;
const FEEDBACK_BYTES = 32 * 1024;

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

test("recommendation request budgets leave headroom below Express default", () => {
  const request = {
    history: { __budget: HISTORY_BYTES },
    feedback: { __budget: FEEDBACK_BYTES },
  };

  assert.ok(bytes(request) < 100 * 1024);
});
