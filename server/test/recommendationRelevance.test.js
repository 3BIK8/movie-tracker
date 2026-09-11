import test from "node:test";
import assert from "node:assert/strict";
import { buildExplorationQueries } from "../services/recommendations/explorationStrategy.js";
import { isGroundedExploitation } from "../services/recommendations/recommendationsService.js";

function signal(evidenceScore, appearances = 1) {
  return { evidenceScore, appearances };
}

test("exploration uses learned release eras instead of arbitrary historical eras", () => {
  const profile = {
    genres: { "28": signal(2) },
    languages: { en: signal(1) },
    years: {
      "2010": signal(3, 4),
      "2020": signal(5, 6),
      "1990": signal(0),
    },
  };

  const queries = buildExplorationQueries("movie", profile, 3, () => 0);

  assert.equal(queries.length, 3);

  for (const query of queries) {
    const match = query.yearRange.match(/^(\d{4})-(\d{4})$/);
    assert.ok(match);
    const start = Number(match[1]);
    const end = Number(match[2]);

    assert.ok(start >= 2010);
    assert.ok(end <= new Date().getFullYear());
  }
});

test("exploration falls back to contemporary eras when no release-year preference exists", () => {
  const queries = buildExplorationQueries("movie", { genres: {}, languages: {}, years: {} }, 3, () => 0);

  assert.ok(queries.every((query) => query.yearRange === "2010-2026" || query.yearRange === "2000-2009"));
});

test("exploitation candidates require positive learned evidence", () => {
  assert.equal(
    isGroundedExploitation({
      pool: "exploitation",
      recommendationScore: 4,
      connectionEvidence: [{ type: "actor", value: "1", score: 2 }],
      historyAnchorScore: 0,
      hardNegative: false,
    }),
    true,
  );

  assert.equal(
    isGroundedExploitation({
      pool: "exploitation",
      recommendationScore: 0,
      connectionEvidence: [],
      historyAnchorScore: 0,
      hardNegative: false,
    }),
    false,
  );

  assert.equal(
    isGroundedExploitation({
      pool: "exploitation",
      recommendationScore: 3,
      connectionEvidence: [],
      historyAnchorScore: 0,
      hardNegative: true,
    }),
    false,
  );
});

test("exploration candidates are not rejected by exploitation grounding", () => {
  assert.equal(
    isGroundedExploitation({
      pool: "exploration",
      recommendationScore: 0,
      connectionEvidence: [],
      historyAnchorScore: 0,
      hardNegative: false,
    }),
    true,
  );
});
