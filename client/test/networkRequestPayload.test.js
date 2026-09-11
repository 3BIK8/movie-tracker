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

test("compactNetworkHistory preserves all history within the bounded transport contract", () => {
  const movies = Array.from({ length: 220 }, (_, index) => ({
    type: "movie",
    id: String(index + 1),
    lastInteractedAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));
  const tv = Array.from({ length: 68 }, (_, index) => ({
    type: "tv",
    id: String(9001 + index),
    status: "watched",
    rating: index === 0 ? "S" : "C",
    lastInteractedAt: `2026-08-${String((index % 9) + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));

  const result = compactNetworkHistory([...movies, ...tv]);

  assert.equal(result.length, 288);
  assert.equal(result.filter((item) => item.type === "movie").length, 220);
  assert.equal(result.filter((item) => item.type === "tv").length, 68);
  assert.ok(result.some((item) => item.type === "tv" && item.rating === "S"));
  assert.equal(new Set(result.map((item) => `${item.type}:${item.id}`)).size, result.length);
  assert.ok(result.length <= NETWORK_REQUEST_LIMITS.maxItems);
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
