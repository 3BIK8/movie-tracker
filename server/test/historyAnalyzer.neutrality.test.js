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

test("C-only history contributes no taste evidence", () => {
  const profile = analyzeHistory([media("C")]);

  assert.deepEqual(profile.movies.connections.actors, {});
  assert.deepEqual(profile.movies.connections.directors, {});
  assert.equal(profile.movies.tmdbRatingProfile.observations, 0);
});

test("adding a C-rated item does not change an A-rated profile", () => {
  const withoutC = analyzeHistory([media("A")]);
  const withC = analyzeHistory([media("A"), media("C")]);

  assert.deepEqual(withC, withoutC);
});

test("D-rated evidence remains negative", () => {
  const profile = analyzeHistory([media("D")]);
  const actor = profile.movies.connections.actors["actor-1"];

  assert.equal(actor.positiveScore, 0);
  assert.equal(actor.negativeScore, 1);
  assert.ok(actor.evidenceScore < 0);
});
