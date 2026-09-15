import test from "node:test";
import assert from "node:assert/strict";

import {
  scoreCandidate,
  rankCandidates,
  RECOMMENDATION_SCORING_POLICY,
} from "../services/recommendations/recommendationScorer.js";

function historyItem({ id = 1, type = "movie", rating, connections, title = "History" }) {
  return { id, type, title, status: "watched", rating, connections };
}
function candidate({ id = 100, type = "movie", connections, title = "Candidate", tmdbRating = null }) {
  return { id, type, title, connections, tmdbRating };
}
function actor(id = "actor-1") { return { type: "actor", value: id }; }
function genre(id = "genre-1") { return { type: "genre", value: id }; }

test("library membership creates a small actor similarity signal", () => {
  const result = scoreCandidate(candidate({ connections: [actor()] }), [historyItem({ rating: "S", connections: [actor()] })]);
  assert.ok(result.recommendationScore > 0);
  assert.equal(result.strongScore, 0);
  assert.ok(result.sourceCount > 0);
  assert.ok(result.sourceEvidence <= RECOMMENDATION_SCORING_POLICY.channelCaps.actor);
});

test("a low rating does not turn library membership into negative actor evidence", () => {
  const result = scoreCandidate(candidate({ connections: [actor()] }), [historyItem({ rating: "D", connections: [actor()] })]);
  assert.ok(result.recommendationScore > 0);
  assert.equal(result.strongScore, 0);
  assert.ok(result.sourceCount > 0);
});

test("a neutral rating still receives library-based similarity", () => {
  const result = scoreCandidate(candidate({ connections: [actor()] }), [historyItem({ rating: "C", connections: [actor()] })]);
  assert.ok(result.recommendationScore > 0);
  assert.equal(result.strongScore, 0);
  assert.ok(result.sourceCount > 0);
  assert.ok(result.connectionEvidence.length > 0);
});

test("TV actor connections are ignored", () => {
  const result = scoreCandidate(candidate({ type: "tv", connections: [actor()] }), [historyItem({ type: "tv", rating: "S", connections: [actor()] })]);
  assert.equal(result.recommendationScore, 0);
  assert.equal(result.sourceCount, 0);
});

test("movie and TV histories remain isolated", () => {
  const result = scoreCandidate(candidate({ type: "movie", connections: [actor("shared")] }), [historyItem({ type: "tv", rating: "S", connections: [actor("shared")] })]);
  assert.equal(result.recommendationScore, 0);
  assert.equal(result.sourceCount, 0);
});

test("implicit skipped feedback weakens a previously positive connection", () => {
  const input = candidate({ connections: [actor("a")] });
  const history = [historyItem({ rating: "S", connections: [actor("a")] })];
  const baseline = rankCandidates([input], history)[0];
  const withFeedback = rankCandidates([input], history, {
    exposures: [{ type: "movie", id: "200", connections: [actor("a")], interactions: [{ event: "skipped" }] }],
  })[0];
  assert.ok(withFeedback.recommendationScore < baseline.recommendationScore);
});

test("not-interested feedback removes the exact title from ranking", () => {
  const input = candidate({ id: 200, connections: [actor("a")] });
  const history = [historyItem({ rating: "S", connections: [actor("a")] })];
  const baseline = rankCandidates([input], history);
  const filtered = rankCandidates([input], history, {
    exposures: [{ type: "movie", id: "200", interactions: [{ event: "ignored" }] }],
  });
  assert.equal(baseline.length, 1);
  assert.equal(filtered.length, 0);
});

test("repeated actor evidence strengthens confidence without unbounded growth", () => {
  const single = scoreCandidate(candidate({ connections: [actor("a")] }), [historyItem({ id: 1, rating: "S", connections: [actor("a")] })]);
  const repeated = scoreCandidate(
    candidate({ connections: [actor("a")] }),
    Array.from({ length: 100 }, (_, index) => historyItem({ id: index + 1, rating: "S", connections: [actor("a")] })),
  );
  assert.ok(repeated.recommendationScore > single.recommendationScore);
  assert.ok(repeated.recommendationScore < single.recommendationScore * 2);
});

test("multiple actor matches cannot overwhelm independent genre evidence", () => {
  const actorHistory = Array.from({ length: 20 }, (_, index) => historyItem({ id: index + 1, rating: "S", connections: [actor(`a-${index % 4}`)] }));
  const actorCandidate = candidate({ id: 1, connections: [actor("a-0"), actor("a-1"), actor("a-2"), actor("a-3")] });
  const genreCandidate = candidate({ id: 2, connections: [genre("drama"), genre("thriller")] });
  const history = [...actorHistory, historyItem({ id: 50, rating: "S", connections: [genre("drama"), genre("thriller")] })];
  const ranked = rankCandidates([actorCandidate, genreCandidate], history);
  assert.ok(ranked[0].recommendationScore < 2);
  assert.ok(ranked[0].sourceEvidence <= RECOMMENDATION_SCORING_POLICY.channelCaps.genre + RECOMMENDATION_SCORING_POLICY.channelCaps.actor);
});

test("candidate quality contributes a bounded bonus", () => {
  const history = [historyItem({ rating: "S", connections: [genre("drama")] })];
  const low = scoreCandidate(candidate({ id: 1, connections: [genre("drama")], tmdbRating: 5.9 }), history);
  const high = scoreCandidate(candidate({ id: 2, connections: [genre("drama")], tmdbRating: 8.5 }), history);
  assert.ok(high.recommendationScore > low.recommendationScore);
  assert.ok(high.qualityBonus <= RECOMMENDATION_SCORING_POLICY.maxQualityBonus);
});

test("previously exposed recommendations use a score-relative novelty multiplier", () => {
  const input = candidate({ id: 200, connections: [actor("a")] });
  const history = [historyItem({ rating: "S", connections: [actor("a")] })];
  const baseline = rankCandidates([input], history)[0];
  const exposed = rankCandidates([input], history, {
    exposures: [
      { type: "movie", id: "200", exposedAt: new Date().toISOString(), connections: [actor("a")], interactions: [] },
      { type: "movie", id: "200", exposedAt: new Date().toISOString(), connections: [actor("a")], interactions: [] },
    ],
  })[0];
  assert.equal(exposed.exposureCount, 2);
  assert.ok(exposed.exposurePenalty > 0);
  assert.ok(exposed.exposureMultiplier < 1);
  assert.ok(exposed.recommendationScore < baseline.recommendationScore);
});

test("scoring remains deterministic for identical inputs", () => {
  const history = [historyItem({ id: 1, rating: "S", connections: [actor("a")] }), historyItem({ id: 2, rating: "A", connections: [actor("a")] })];
  const input = candidate({ connections: [actor("a")] });
  assert.deepEqual(scoreCandidate(input, history), scoreCandidate(input, history));
});

test("scores remain finite under repeated evidence", () => {
  const history = Array.from({ length: 100 }, (_, index) => historyItem({ id: index + 1, rating: index % 2 === 0 ? "S" : "D", connections: [actor("a")] }));
  const result = scoreCandidate(candidate({ connections: [actor("a")] }), history);
  assert.ok(Number.isFinite(result.recommendationScore));
  assert.ok(Number.isFinite(result.strongScore));
  assert.ok(Number.isFinite(result.genreScore));
  assert.ok(Number.isFinite(result.contextScore));
});
