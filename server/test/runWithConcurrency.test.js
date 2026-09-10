import test from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "../utils/runWithConcurrency.js";

test("mapWithConcurrency preserves input order", async () => {
  const result = await mapWithConcurrency(
    [1, 2, 3, 4],
    async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 5 * (5 - value)));
      return value * 2;
    },
    2,
  );

  assert.deepEqual(result, [2, 4, 6, 8]);
});

test("mapWithConcurrency never exceeds the configured concurrency", async () => {
  let active = 0;
  let maximum = 0;

  await mapWithConcurrency(
    [1, 2, 3, 4, 5, 6],
    async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    },
    2,
  );

  assert.equal(maximum, 2);
});

test("mapWithConcurrency validates its arguments", async () => {
  await assert.rejects(
    () => mapWithConcurrency(null, async () => null),
    TypeError,
  );

  await assert.rejects(
    () => mapWithConcurrency([], async () => null, 0),
    RangeError,
  );
});
