import test from "node:test";
import assert from "node:assert/strict";
import {
  assertTasteProfile,
  createTasteProfile,
  DIMENSIONS,
  TASTE_PROFILE_VERSION,
} from "../services/recommendations/tasteProfile.js";

function signal(overrides = {}) {
  return {
    netScore: 2,
    evidenceScore: 1.5,
    confidence: 0.75,
    appearances: 3,
    positiveAppearances: 3,
    negativeAppearances: 0,
    temporalNetScore: 1.2,
    temporalEvidenceScore: 0.9,
    ...overrides,
  };
}

function analysis(overrides = {}) {
  return {
    connections: {
      actors: {
        "101": signal(),
      },
      genres: {
        Drama: signal({ netScore: -1, evidenceScore: -0.5, confidence: 0.4 }),
      },
    },
    tmdbRatingProfile: { buckets: {}, observations: 0 },
    temporal: {
      observations: 3,
      recentObservations: 2,
      favoriteObservations: 1,
      averageRecencyWeight: 0.8,
    },
    strength: {
      score: 0.7,
      coverage: 0.5,
      breadth: 0.6,
      recency: 0.8,
      evidenceSignals: 2,
    },
    feedback: { skipped: 1, ignored: 2, applied: 3 },
    ...overrides,
  };
}

test("canonical taste profile preserves all declared dimensions", () => {
  const profile = createTasteProfile({
    movies: analysis(),
    tv: analysis(),
  });

  assert.equal(profile.version, TASTE_PROFILE_VERSION);
  assert.deepEqual(profile.dimensions, DIMENSIONS);
  assert.equal(profile.mediaTypes.movies.dimensions.actors["101"].direction, "positive");
  assert.equal(profile.mediaTypes.movies.dimensions.genres.Drama.direction, "negative");
  assert.equal(profile.mediaTypes.movies.uncertainty.signals, 2);
  assert.equal(profile.mediaTypes.movies.uncertainty.lowConfidenceSignals, 1);
  assert.equal(profile.mediaTypes.movies.feedback.applied, 3);
  assert.doesNotThrow(() => assertTasteProfile(profile));
});

test("missing analysis produces a valid empty profile", () => {
  const profile = createTasteProfile({});

  assert.equal(profile.mediaTypes.movies.temporal.observations, 0);
  assert.equal(profile.mediaTypes.tv.strength.score, 0);
  assert.equal(profile.mediaTypes.movies.uncertainty.score, 1);
  assert.doesNotThrow(() => assertTasteProfile(profile));
});

test("profile validation rejects missing media type", () => {
  const profile = createTasteProfile({ movies: analysis(), tv: analysis() });
  delete profile.mediaTypes.tv;

  assert.throws(
    () => assertTasteProfile(profile),
    /missing media type: tv/,
  );
});

test("profile validation rejects incompatible version", () => {
  const profile = createTasteProfile({ movies: analysis(), tv: analysis() });
  profile.version = 999;

  assert.throws(
    () => assertTasteProfile(profile),
    /Invalid taste profile version/,
  );
});
