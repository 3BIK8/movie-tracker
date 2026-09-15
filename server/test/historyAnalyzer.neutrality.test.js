import test from "node:test";
import assert from "node:assert/strict";

import { analyzeHistory } from "../services/recommendations/historyAnalyzer.js";

const media = (rating) => ({
  type: "movie",
  id: "1",
  status: "watched",
  rating,
  year: 2020,
  language: "en",
  popularity: 20,
  actors: [{ id: "actor-1" }],
  directors: [{ id: "director-1" }],
  genres: [{ id: 18 }],
  franchises: [],
  studios: [{ id: "studio-1" }],
  tmdbRating: 7,
});

test("library membership contributes evidence regardless of rating", () => {
  const profile = analyzeHistory([media("C")]);
  const actor = profile.movies.connections.actors["actor-1"];

  assert.ok(actor);
  assert.equal(actor.positiveScore, 0.35);
  assert.equal(actor.negativeScore, 0);
  assert.equal(profile.movies.tmdbRatingProfile.observations, 1);
});

test("a neutral rating still contributes library evidence", () => {
  const withoutC = analyzeHistory([media("A")]);
  const withC = analyzeHistory([media("A"), { ...media("C"), id: "2" }]);

  const actorWithoutC = withoutC.movies.connections.actors["actor-1"];
  const actorWithC = withC.movies.connections.actors["actor-1"];

  assert.ok(actorWithC.positiveScore > actorWithoutC.positiveScore);
  assert.ok(actorWithC.positiveScore < actorWithoutC.positiveScore * 2);
});

test("a low rating is only a small modifier, not a negative taste label", () => {
  const profile = analyzeHistory([media("D")]);
  const actor = profile.movies.connections.actors["actor-1"];

  assert.ok(actor.positiveScore > 0);
  assert.equal(actor.negativeScore, 0);
  assert.ok(actor.evidenceScore > 0);
});
