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

test("C ratings are neutral and do not create connection evidence", () => {
  const profile = analyzeHistory([createMedia({ rating: "C" })]);
  const movieConnections = profile.movies.connections;

  assert.deepEqual(movieConnections.actors, {});
  assert.deepEqual(movieConnections.directors, {});
  assert.deepEqual(movieConnections.genres, {});
  assert.deepEqual(movieConnections.studios, {});
  assert.deepEqual(movieConnections.keywords, {});
  assert.deepEqual(profile.movies.tmdbRatingProfile, {
    buckets: {},
    observations: 0,
  });
});

test("C ratings do not dilute confidence for evidence-bearing ratings", () => {
  const profile = analyzeHistory([
    createMedia({ rating: "A", id: 1 }),
    createMedia({ rating: "C", id: 2 }),
  ]);

  const actorSignal = profile.movies.connections.actors["10"];

  assert.equal(actorSignal.appearances, 1);
  assert.equal(actorSignal.positiveAppearances, 1);
  assert.equal(actorSignal.positiveScore, 0.7);
  assert.equal(actorSignal.negativeScore, 0);
  assert.equal(actorSignal.netScore, 0.7);
  assert.equal(actorSignal.confidence, 0.5);
  assert.equal(actorSignal.evidenceScore, 0.35);
  assert.equal(profile.movies.tmdbRatingProfile.observations, 1);
});

test("D ratings remain negative evidence", () => {
  const profile = analyzeHistory([createMedia({ rating: "D" })]);
  const actorSignal = profile.movies.connections.actors["10"];

  assert.equal(actorSignal.appearances, 1);
  assert.equal(actorSignal.positiveAppearances, 0);
  assert.equal(actorSignal.negativeAppearances, 1);
  assert.equal(actorSignal.netScore, -1);
  assert.equal(actorSignal.evidenceScore, -0.5);
});

test("keyword signals become part of the preference profile", () => {
  const profile = analyzeHistory([createMedia({ rating: "A" })]);
  const keywordSignal = profile.movies.connections.keywords["50"];

  assert.equal(keywordSignal.positiveScore, 0.7);
  assert.equal(keywordSignal.evidenceScore, 0.35);
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
  const halfLife = now - 180 * 86_400_000;
  const old = now - 730 * 86_400_000;

  assert.equal(calculateRecencyWeight(halfLife, now), 0.5);
  assert.ok(calculateRecencyWeight(old, now) < 0.1);
});

test("recent and favorite interactions produce stronger temporal evidence", () => {
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

  assert.ok(actorSignal.temporalPositiveScore > 1);
  assert.ok(actorSignal.temporalPositiveScore < actorSignal.positiveScore);
  assert.equal(profile.movies.temporal.observations, 2);
  assert.equal(profile.movies.temporal.favoriteObservations, 1);
  assert.ok(profile.movies.temporal.averageRecencyWeight < 1);
  assert.ok(FAVORITE_TEMPORAL_MULTIPLIER > 1);
});
