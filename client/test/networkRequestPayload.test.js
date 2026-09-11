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
      rating: " a ",
      favorite: true,
      lastInteractedAt: "2026-09-10T00:00:00.000Z",
    },
  ]);

  assert.deepEqual(result, [
    {
      type: "movie",
      id: "1",
      status: "watched",
      rating: "A",
      favorite: true,
      createdAt: null,
      statusChangedAt: null,
      ratingUpdatedAt: null,
      favoriteAt: null,
      lastInteractedAt: "2026-09-10T00:00:00.000Z",
    },
  ]);
});

test("compactNetworkHistory preserves TV coverage under the global cap", () => {
  const movies = Array.from({ length: 220 }, (_, index) => ({
    type: "movie",
    id: String(index + 1),
    lastInteractedAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));
  const tv = [
    {
      type: "tv",
      id: "9001",
      status: "watched",
      rating: "S",
      lastInteractedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      type: "tv",
      id: "9002",
      lastInteractedAt: "2026-01-02T00:00:00.000Z",
    },
  ];

  const result = compactNetworkHistory([...movies, ...tv]);

  assert.equal(result.length, NETWORK_REQUEST_LIMITS.maxItems);
  assert.ok(result.some((item) => item.type === "movie"));
  assert.ok(result.some((item) => item.type === "tv"));
  assert.ok(result.some((item) => item.type === "tv" && item.rating === "S"));
  assert.equal(new Set(result.map((item) => `${item.type}:${item.id}`)).size, result.length);
});

test("compactNetworkHistory rejects invalid personal ratings", () => {
  const result = compactNetworkHistory([
    { type: "movie", id: "1", status: "watched", rating: 5 },
    { type: "movie", id: "2", status: "watched", rating: "invalid" },
    { type: "movie", id: "3", status: "watched", rating: "D" },
  ]);

  assert.equal(result.find((item) => item.id === "1").rating, null);
  assert.equal(result.find((item) => item.id === "2").rating, null);
  assert.equal(result.find((item) => item.id === "3").rating, "D");
});
