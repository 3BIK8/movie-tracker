import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTemporalAdjustment,
  applyTemporalScoring,
} from "../services/recommendations/temporalRecommendationScoring.js";

function profileSignal(evidenceScore, temporalEvidenceScore) {
  return {
    connections: {
      actors: {
        "42": {
          evidenceScore,
          temporalEvidenceScore,
        },
      },
    },
  };
}

function candidate(score, actorScore = score) {
  return {
    id: "100",
    type: "movie",
    recommendationScore: score,
    negativeScore: 0,
    hardNegative: false,
    connectionEvidence: [
      {
        type: "actor",
        value: "42",
        score: actorScore,
      },
    ],
    scoreBreakdown: {
      strong: score,
      final: score,
    },
  };
}

test("recent positive evidence keeps the existing connection score", () => {
  const adjustment = calculateTemporalAdjustment(
    candidate(4),
    profileSignal(1, 1),
  );

  assert.equal(adjustment, 0);
});

test("older positive evidence is attenuated using the existing temporal signal", () => {
  const adjustment = calculateTemporalAdjustment(
    candidate(4),
    profileSignal(1, 0.25),
  );

  assert.equal(adjustment, -3);
});

test("older negative evidence also loses influence rather than becoming stronger", () => {
  const adjustment = calculateTemporalAdjustment(
    candidate(-2, -2),
    profileSignal(-1, -0.25),
  );

  assert.equal(adjustment, 1.5);
});

test("temporal scoring changes ranking without changing candidates", () => {
  const older = candidate(5);
  older.id = "older";

  const recent = candidate(4);
  recent.id = "recent";
  recent.connectionEvidence[0].value = "43";

  const reranked = applyTemporalScoring(
    [older, recent],
    {
      connections: {
        actors: {
          "42": {
            evidenceScore: 1,
            temporalEvidenceScore: 0.25,
          },
          "43": {
            evidenceScore: 1,
            temporalEvidenceScore: 1,
          },
        },
      },
    },
  );

  assert.deepEqual(
    reranked.map((item) => item.id),
    ["recent", "older"],
  );
  assert.equal(reranked.length, 2);
  assert.ok(reranked[0].temporalAdjustment >= reranked[1].temporalAdjustment);
  assert.equal(reranked[0].scoreBreakdown.temporal, 0);
});
