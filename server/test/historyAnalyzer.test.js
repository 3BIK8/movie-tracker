import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeHistory,
  calculateRecencyWeight,
  FAVORITE_TEMPORAL_MULTIPLIER,
} from "../services/recommendations/historyAnalyzer.js";

function createMedia({ rating, id = 1, type = "movie", overrides = {} } = {}) {
  return {
    id,
    type,
    title: `Test ${id}`,
    status: "watched",
    rating,
    tmdbRating: 7.5,
    year: 2020,
    actors: [{ id: 10, name: "Actor" }],
    directors: [{ id: 20, name: "Director" }],
    genres: [{ id: 30, name: "Drama" }],
    franchises: [],
    studios: [{ id: 40, name: "Studio" }],
    keywords: [{ id: 50, name: "Time travel" }],
    language: "en",
    popularity: 12,
    ...overrides,
  };
}

test("library membership creates connection evidence", () => {
  const profile = analyzeHistory([createMedia({ rating: "C" })]);
  const connections = profile.movies.connections;

  assert.ok(connections.actors["10"].evidenceScore > 0);
  assert.ok(connections.genres["30"].evidenceScore > 0);
  assert.ok(connections.keywords["50"].evidenceScore > 0);
});

test("ratings modify library evidence without defining it", () => {
  const cProfile = analyzeHistory([createMedia({ rating: "C" })]);
  const sProfile = analyzeHistory([createMedia({ rating: "S" })]);
  const dProfile = analyzeHistory([createMedia({ rating: "D" })]);

  const c = cProfile.movies.connections.actors["10"];
  const s = sProfile.movies.connections.actors["10"];
  const d = dProfile.movies.connections.actors["10"];

  assert.ok(c.positiveScore > 0);
  assert.ok(s.positiveScore > c.positiveScore);
  assert.ok(d.positiveScore > 0);
  assert.equal(d.negativeScore, 0);
});

test("adding another library item strengthens evidence", () => {
  const one = analyzeHistory([createMedia({ rating: "A", id: 1 })]);
  const two = analyzeHistory([
    createMedia({ rating: "A", id: 1 }),
    createMedia({ rating: "C", id: 2 }),
  ]);

  const first = one.movies.connections.actors["10"];
  const second = two.movies.connections.actors["10"];

  assert.equal(first.appearances, 1);
  assert.equal(second.appearances, 2);
  assert.ok(second.evidenceScore > first.evidenceScore);
});

test("keyword signals become part of the preference profile", () => {
  const profile = analyzeHistory([createMedia({ rating: "A" })]);
  const keywordSignal = profile.movies.connections.keywords["50"];

  assert.ok(keywordSignal.positiveScore > 0);
  assert.ok(keywordSignal.evidenceScore > 0);
});

test("skipped and ignored recommendation feedback becomes negative profile evidence", () => {
  const profile = analyzeHistory(
    [createMedia({ rating: "A" })],
    {
      exposures: [
        {
          type: "movie",
          id: "2001",
          exposedAt: new Date().toISOString(),
          connections: [
            { type: "genre", value: 30 },
            { type: "keyword", value: 50 },
          ],
          interactions: [{ event: "skipped" }, { event: "ignored" }],
        },
      ],
    },
  );

  const genreSignal = profile.movies.connections.genres["30"];
  const keywordSignal = profile.movies.connections.keywords["50"];

  assert.equal(profile.movies.feedback.skipped, 1);
  assert.equal(profile.movies.feedback.ignored, 1);
  assert.ok(genreSignal.negativeScore > 0);
  assert.ok(keywordSignal.negativeScore > 0);
});

test("recency uses a deterministic half-life", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const halfLife = new Date(now - 180 * 86_400_000).toISOString();
  const old = new Date(now - 730 * 86_400_000).toISOString();

  assert.equal(calculateRecencyWeight(halfLife, now), 0.5);
  assert.ok(calculateRecencyWeight(old, now) < 0.1);
});

test("recent and favorite interactions strengthen temporal evidence", () => {
  const now = Date.now();
  const recent = new Date(now - 7 * 86_400_000).toISOString();
  const old = new Date(now - 365 * 86_400_000).toISOString();

  const profile = analyzeHistory([
    createMedia({
      rating: "A",
      id: 1,
      overrides: { lastInteractedAt: recent, favorite: true },
    }),
    createMedia({
      rating: "A",
      id: 2,
      overrides: { lastInteractedAt: old, favorite: false },
    }),
  ]);

  const actorSignal = profile.movies.connections.actors["10"];

  assert.ok(actorSignal.temporalPositiveScore > 0);
  assert.ok(actorSignal.temporalPositiveScore < actorSignal.positiveScore);
  assert.equal(profile.movies.temporal.observations, 2);
  assert.equal(profile.movies.temporal.favoriteObservations, 1);
  assert.ok(profile.movies.temporal.averageRecencyWeight < 1);
  assert.ok(FAVORITE_TEMPORAL_MULTIPLIER > 1);
});
