import test from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate, rankCandidates, RECOMMENDATION_SCORING_POLICY } from "../services/recommendations/recommendationScorer.js";

function historyItem(overrides = {}) {
  return {
    id: 1,
    type: "movie",
    status: "watched",
    rating: "S",
    connections: [],
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    id: 2,
    type: "movie",
    connections: [],
    tmdbRating: 7.2,
    ...overrides,
  };
}

function actor(value) {
  return { type: "actor", value };
}

function genre(value) {
  return { type: "genre", value };
}

test("library membership is stronger than an individual rating", () => {
  const history = [historyItem({ rating: null, connections: [genre("thriller"), { type: "keyword", value: "psychological" }] })];
  const scored = scoreCandidate(candidate({ connections: [genre("thriller"), { type: "keyword", value: "psychological" }] }), history);
  assert.ok(scored.recommendationScore > 0);
  assert.ok(scored.genreScore > 0);
  assert.ok(scored.scoreBreakdown.quality > 0);
});

test("actor similarity remains a supporting signal", () => {
  const history = [historyItem({ connections: [actor("famous-actor")] })];
  const scored = scoreCandidate(candidate({ connections: [actor("famous-actor")] }), history);
  assert.ok(scored.scoreBreakdown.channels.actor.positiveScore <= 0.12);
});

test("director and studio similarity do not affect personalization", () => {
  const history = [historyItem({ connections: [{ type: "director", value: "director-1" }, { type: "studio", value: "studio-1" }] })];
  const scored = scoreCandidate(candidate({ connections: [{ type: "director", value: "director-1" }, { type: "studio", value: "studio-1" }] }), history);
  assert.equal(scored.scoreBreakdown.channels.director?.positiveScore ?? 0, 0);
  assert.equal(scored.scoreBreakdown.channels.studio?.positiveScore ?? 0, 0);
});

test("ratings only make a small difference for the same movie characteristics", () => {
  const baseHistory = [historyItem({ rating: "C", connections: [genre("science-fiction")] })];
  const input = candidate({ connections: [genre("science-fiction")] });
  const low = scoreCandidate(input, baseHistory).recommendationScore;
  const high = scoreCandidate(input, [{ ...baseHistory[0], rating: "S" }]).recommendationScore;
  assert.ok(high > low);
  assert.ok(high - low < 0.2);
});

test("candidate quality contributes a bounded bonus", () => {
  const history = [historyItem({ connections: [genre("drama")] })];
  const low = scoreCandidate(candidate({ id: 1, connections: [genre("drama")], tmdbRating: 5.9 }), history);
  const high = scoreCandidate(candidate({ id: 2, connections: [genre("drama")], tmdbRating: 8.5 }), history);
  assert.ok(high.recommendationScore > low.recommendationScore);
  assert.ok(high.qualityBonus <= RECOMMENDATION_SCORING_POLICY.maxQualityBonus);
});

test("recently exposed recommendations are temporarily suppressed", () => {
  const input = candidate({ id: 200, connections: [actor("a")] });
  const history = [historyItem({ connections: [actor("a")] })];
  const ranked = rankCandidates([input], history, {
    exposures: [{
      type: "movie",
      id: "200",
      exposedAt: new Date().toISOString(),
      connections: [actor("a")],
      interactions: [],
    }],
  });
  assert.equal(ranked.length, 0);
});

test("expired exposure still applies a novelty penalty without suppressing the title", () => {
  const input = candidate({ id: 200, connections: [actor("a")] });
  const history = [historyItem({ connections: [actor("a")] })];
  const baseline = rankCandidates([input], history)[0];
  const exposedAt = new Date(Date.now() - 91 * 86_400_000).toISOString();
  const exposed = rankCandidates([input], history, {
    exposures: [
      { type: "movie", id: "200", exposedAt, connections: [actor("a")], interactions: [] },
      { type: "movie", id: "200", exposedAt, connections: [actor("a")], interactions: [] },
    ],
  })[0];
  assert.equal(exposed.exposureCount, 2);
  assert.ok(exposed.exposurePenalty > 0);
  assert.ok(exposed.exposureMultiplier < 1);
  assert.ok(exposed.recommendationScore < baseline.recommendationScore);
});

test("a visible page suppresses only those items, preserving pagination capacity", () => {
  const candidates = Array.from({ length: 60 }, (_, index) =>
    candidate({ id: 1000 + index, connections: [genre("drama")] }),
  );
  const exposures = candidates.slice(0, 20).map((item) => ({
    type: "movie",
    id: String(item.id),
    exposedAt: new Date().toISOString(),
    connections: item.connections,
    interactions: [],
  }));

  const ranked = rankCandidates(candidates, [historyItem({ connections: [genre("drama")] })], { exposures });

  assert.equal(ranked.length, 40);
  assert.ok(ranked.every((item) => Number(item.id) >= 1020));
});

test("skipped or automatically ignored navigation is not a permanent negative", () => {
  const input = candidate({ id: 300, connections: [genre("drama")] });
  const history = [historyItem({ connections: [genre("drama")] })];
  const exposedAt = new Date(Date.now() - 91 * 86_400_000).toISOString();

  const ranked = rankCandidates([input], history, {
    exposures: [{
      type: "movie",
      id: "300",
      exposedAt,
      connections: [genre("drama")],
      interactions: [{ event: "ignored", timestamp: exposedAt }],
    }],
  });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].id, 300);
});

test("explicit not interested remains a permanent item-level exclusion", () => {
  const input = candidate({ id: 301, connections: [genre("drama")] });
  const history = [historyItem({ connections: [genre("drama")] })];
  const ranked = rankCandidates([input], history, {
    exposures: [{
      type: "movie",
      id: "301",
      exposedAt: new Date(Date.now() - 91 * 86_400_000).toISOString(),
      connections: [genre("drama")],
      interactions: [{ event: "not_interested", timestamp: new Date().toISOString() }],
    }],
  });

  assert.equal(ranked.length, 0);
});

test("scoring remains deterministic for identical inputs", () => {
  const history = [historyItem({ id: 1, connections: [actor("a")] }), historyItem({ id: 2, rating: "A", connections: [actor("a")] })];
  const input = candidate({ connections: [actor("a")] });
  assert.deepEqual(scoreCandidate(input, history), scoreCandidate(input, history));
});

test("scores remain finite under repeated evidence", () => {
  const history = Array.from({ length: 20 }, (_, index) => historyItem({ id: index + 1, connections: [genre("drama"), actor("a")] }));
  const scored = scoreCandidate(candidate({ connections: [genre("drama"), actor("a")] }), history);
  assert.ok(Number.isFinite(scored.recommendationScore));
  assert.ok(Number.isFinite(scored.positiveScore));
});


test("recommendations expose an explanation grounded in watched history", () => {
  const history = [
    historyItem({
      id: 10,
      title: "Watched Drama",
      connections: [genre("drama"), { type: "keyword", value: "psychological" }],
    }),
  ];
  const scored = scoreCandidate(
    candidate({
      connections: [genre("drama"), { type: "keyword", value: "psychological" }],
    }),
    history,
  );

  assert.match(scored.recommendationReason, /similar to Watched Drama/);
  assert.match(scored.recommendationReason, /shares/);
});
