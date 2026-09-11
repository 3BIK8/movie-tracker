const CONNECTION_TYPE_MAP = Object.freeze({
  actor: "actors",
  director: "directors",
  genre: "genres",
  franchise: "franchises",
  studio: "studios",
  keyword: "keywords",
  decade: "years",
  language: "languages",
  mediaType: "mediaTypes",
});

function getTemporalSignal(profile, connection) {
  const profileType = CONNECTION_TYPE_MAP[connection.type];

  if (!profileType) {
    return null;
  }

  return profile?.connections?.[profileType]?.[String(connection.value)] || null;
}

/**
 * Applies the temporal evidence already learned by historyAnalyzer to the
 * connection scores produced by recommendationScorer.
 *
 * The adjustment is deliberately relative to the existing scorer output:
 * temporalEvidenceScore/evidenceScore is used as the evidence attenuation
 * ratio. This means we do not introduce a second set of arbitrary weights or
 * alter the existing connection hierarchy.
 */
export function calculateTemporalAdjustment(candidate, profile) {
  if (!profile?.connections) {
    return 0;
  }

  let adjustment = 0;

  for (const evidence of candidate.connectionEvidence || []) {
    if (!Number.isFinite(evidence.score) || evidence.score === 0) {
      continue;
    }

    const signal = getTemporalSignal(profile, evidence);

    if (!signal || !Number.isFinite(signal.evidenceScore)) {
      continue;
    }

    const temporalRatio =
      signal.evidenceScore / (signal.evidenceScore || evidence.score);

    const temporalScore = evidence.score * temporalRatio;
    adjustment += temporalScore - evidence.score;
  }

  return adjustment;
}

export function applyTemporalScoring(candidates, profile) {
  return candidates
    .map((candidate) => {
      const temporalAdjustment = calculateTemporalAdjustment(candidate, profile);
      const recommendationScore =
        candidate.recommendationScore + temporalAdjustment;
      const finalScore = candidate.hardNegative
        ? Math.min(
            recommendationScore,
            -Math.max(candidate.negativeScore, 1),
          )
        : recommendationScore;

      return {
        ...candidate,
        recommendationScore,
        temporalAdjustment,
        scoreBreakdown: {
          ...candidate.scoreBreakdown,
          temporal: temporalAdjustment,
          final: finalScore,
        },
        finalScore,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}
