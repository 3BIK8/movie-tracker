import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeHistory,
  calculateRecencyWeight,
} from "../services/recommendations/historyAnalyzer.js";

function media(overrides = {}) {
  return {
    id: 1,
    type: "movie",
    status: "watched",
    rating: "S",
    actors: [{ id: 10 }],
    directors: [{ id: 20 }],
    genres: [{ id: 30 }],
    franchises: [{ id: 40 }],
    studios: [{ id: 50 }],
    keywords: [{ id: 60 }],
    year: 2020,
    language: "en",
    popularity: 10,
    ...overrides,
  };
}

test("C ratings are neutral and do not create connection evidence", () => {
  const profile = analyzeHistory([
    media({ id: 1, rating: "C" }),
    media({ id: 2, rating: "S" }),
  ]);

  assert.equal(profile.movies.connections.actors["10"].appearances, 1);
});

test("C ratings do not dilute confidence for evidence-bearing ratings", () => {
  const withoutC = analyzeHistory([media({ id: 1, rating: "A" })]);
  const withC = analyzeHistory([
    media({ id: 1, rating: "A" }),
    media({ id: 2, rating: "C" }),
  ]);

  assert.equal(
    withC.movies.connections.actors["10"].confidence,
    withoutC.movies.connections.actors["10"].confidence,
  );
});

test("D ratings remain negative evidence", () => {
  const profile = analyzeHistory([media({ id: 1, rating: "D" })]);
  const signal = profile.movies.connections.actors["10"];

  assert.equal(signal.positiveScore, 0);
  assert.equal(signal.negativeScore, 1);
  assert.equal(signal.netScore, -1);
});

test("keyword signals become part of the preference profile", () => {
  const profile = analyzeHistory([media({ keywords: [{ id: 99 }] })]);
  assert.ok(profile.movies.connections.keywords["99"].evidenceScore > 0);
});

test("skipped and ignored recommendation feedback becomes negative profile evidence", () => {
  const history = [media({ id: 1, rating: "S" })];
  const feedback = {
    exposures: [
      {
        type: "movie",
        exposedAt: "2026-01-01T00:00:00.000Z",
        connections: [{ type: "actor", value: 10 }],
        interactions: [{ event: "skipped" }],
      },
      {
        type: "movie",
        exposedAt: "2026-01-01T00:00:00.000Z",
        connections: [{ type: "actor", value: 10 }],
        interactions: [{ event: "ignored" }],
      },
    ],
  };

  const profile = analyzeHistory(history, feedback);
  const signal = profile.movies.connections.actors["10"];

  assert.ok(signal.implicitNegativeScore === undefined || signal.negativeScore > 0);
  assert.equal(profile.movies.feedback.skipped, 1);
  assert.equal(profile.movies.feedback.ignored, 1);
});

test("recency uses a deterministic half-life", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const halfLife = new Date(now - 180 * 86_400_000).toISOString();
  const old = new Date(now - 730 * 86_400_000).toISOString();

  assert.ok(Math.abs(calculateRecencyWeight(halfLife, now) - 0.5) < 0.0000001);
  assert.ok(calculateRecencyWeight(old, now) < 0.1);
});

test("recent and favorite interactions produce stronger temporal evidence", () => {
  const profile = analyzeHistory([
    media({
      id: 1,
      rating: "S",
      lastInteractedAt: "2025-12-01T00:00:00.000Z",
    }),
    media({
      id: 2,
      rating: "S",
      favorite: true,
      lastInteractedAt: "2025-12-20T00:00:00.000Z",
    }),
  ]);

  const actorSignal = profile.movies.connections.actors["10"];

  assert.ok(actorSignal.temporalPositiveScore > 1);
  assert.ok(actorSignal.temporalPositiveScore < actorSignal.positiveScore);
  assert.equal(profile.movies.temporal.observations, 2);
  assert.equal(profile.movies.temporal.favoriteObservations, 1);
  assert.ok(profile.movies.temporal.averageRecencyWeight < 1);
});
