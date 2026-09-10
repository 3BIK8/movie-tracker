import test from "node:test";
import assert from "node:assert/strict";
import {
  compactNetworkHistory,
  NETWORK_REQUEST_LIMITS,
} from "../src/services/networkRequestPayload.js";

test("compactNetworkHistory keeps only canonical network evidence", () => {
  const result = compactNetworkHistory([
    {
      type: " MOVIE ",
      id: "001",
      title: "Large client-only field",
      actors: Array.from({ length: 100 }, (_, index) => ({ id: index })),
      status: "watched",
      rating: 5,
      favorite: true,
      lastInteractedAt: "2026-09-10T00:00:00.000Z",
    },
  ]);

  assert.deepEqual(result, [
    {
      type: "movie",
      id: "1",
      status: "watched",
      rating: 5,
      favorite: true,
      createdAt: null,
      statusChangedAt: null,
      ratingUpdatedAt: null,
      favoriteAt: null,
      lastInteractedAt: "2026-09-10T00:00:00.000Z",
    },
  ]);
});

test("compactNetworkHistory deduplicates and caps history deterministically", () => {
  const history = Array.from({ length: 220 }, (_, index) => ({
    type: "movie",
    id: String(index + 1),
    lastInteractedAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));

  const result = compactNetworkHistory([
    ...history,
    history[0],
  ]);

  assert.equal(result.length, NETWORK_REQUEST_LIMITS.maxItems);
  assert.equal(new Set(result.map((item) => `${item.type}:${item.id}`)).size, result.length);
});
