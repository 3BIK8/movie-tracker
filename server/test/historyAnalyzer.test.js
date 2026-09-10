import test from "node:test";
import assert from "node:assert/strict";
import { analyzeHistory } from "../services/recommendations/historyAnalyzer.js";

function createMedia({ rating, id = 1, type = "movie" } = {}) {
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
    language: "en",
    popularity: 12,
  };
}

test("C ratings are neutral and do not create connection evidence", () => {
  const profile = analyzeHistory([createMedia({ rating: "C" })]);
  const movieConnections = profile.movies.connections;

  assert.deepEqual(movieConnections.actors, {});
  assert.deepEqual(movieConnections.directors, {});
  assert.deepEqual(movieConnections.genres, {});
  assert.deepEqual(movieConnections.studios, {});
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
