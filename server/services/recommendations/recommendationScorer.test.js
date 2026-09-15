import test from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate } from "./recommendationScorer.js";

test("library membership is stronger than an individual rating", () => {
  const history = [
    {
      id: 1,
      type: "movie",
      status: "watched",
      rating: null,
      connections: [
        { type: "genre", value: "thriller" },
        { type: "keyword", value: "psychological" },
      ],
    },
  ];

  const candidate = {
    id: 2,
    type: "movie",
    connections: [
      { type: "genre", value: "thriller" },
      { type: "keyword", value: "psychological" },
    ],
    tmdbRating: 7.2,
  };

  const scored = scoreCandidate(candidate, history);
  assert.ok(scored.recommendationScore > 0);
  assert.ok(scored.genreScore > 0);
  assert.ok(scored.scoreBreakdown.quality > 0);
});

test("actor similarity remains a supporting signal", () => {
  const history = [
    {
      id: 1,
      type: "movie",
      status: "watched",
      rating: "S",
      connections: [{ type: "actor", value: "famous-actor" }],
    },
  ];

  const candidate = {
    id: 2,
    type: "movie",
    connections: [{ type: "actor", value: "famous-actor" }],
    tmdbRating: 7.5,
  };

  const scored = scoreCandidate(candidate, history);
  assert.ok(scored.scoreBreakdown.channels.actor.positiveScore <= 0.12);
});

test("director and studio similarity do not affect personalization", () => {
  const history = [
    {
      id: 1,
      type: "movie",
      status: "watched",
      rating: "S",
      connections: [
        { type: "director", value: "director-1" },
        { type: "studio", value: "studio-1" },
      ],
    },
  ];

  const candidate = {
    id: 2,
    type: "movie",
    connections: [
      { type: "director", value: "director-1" },
      { type: "studio", value: "studio-1" },
    ],
    tmdbRating: 7,
  };

  const scored = scoreCandidate(candidate, history);
  assert.equal(scored.scoreBreakdown.channels.director?.positiveScore ?? 0, 0);
  assert.equal(scored.scoreBreakdown.channels.studio?.positiveScore ?? 0, 0);
});

test("ratings only make a small difference for the same movie characteristics", () => {
  const baseHistory = [
    {
      id: 1,
      type: "movie",
      status: "watched",
      rating: "C",
      connections: [{ type: "genre", value: "science-fiction" }],
    },
  ];
  const candidate = {
    id: 2,
    type: "movie",
    connections: [{ type: "genre", value: "science-fiction" }],
    tmdbRating: 7.2,
  };

  const low = scoreCandidate(candidate, baseHistory).recommendationScore;
  const high = scoreCandidate(candidate, [{ ...baseHistory[0], rating: "S" }]).recommendationScore;

  assert.ok(high > low);
  assert.ok(high - low < 0.2);
});
