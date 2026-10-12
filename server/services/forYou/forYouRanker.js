import { cosineSimilarity } from "./forYouCandidateService.js";

export const FOR_YOU_RANK_CONFIG = Object.freeze({
  longWeight: 0.45,
  interestWeight: 0.25,
  sessionWeight: 0.2,
  qualityWeight: 0.1,
  negativeWeight: 0.2,
  fatigueWeight: 0.08,
  minimumSimilarity: 0.3,
});

function qualityPrior(candidate) {
  const rating = Number(candidate.tmdbRating ?? candidate.rating);
  if (!Number.isFinite(rating)) return 0;
  return Math.max(0, Math.min(1, (rating - 5) / 4));
}

function fatiguePenalty(candidate, exposureCounts = {}) {
  const count = Number(exposureCounts[`${candidate.type}:${candidate.id}`] || 0);
  return Math.min(1, count / 5);
}

export function scoreForYouCandidates(candidates, {
  longVector = null,
  interestVectors = [],
  sessionVector = null,
  rejectedVectors = [],
  skippedVectors = [],
  exposureCounts = {},
  weights = FOR_YOU_RANK_CONFIG,
} = {}) {
  return candidates.map((candidate) => {
    const longScore = longVector ? cosineSimilarity(longVector, candidate.vector) || 0 : 0;
    const interestScore = interestVectors.length
      ? Math.max(...interestVectors.map((vector) => cosineSimilarity(vector, candidate.vector) || 0))
      : 0;
    const sessionScore = sessionVector ? cosineSimilarity(sessionVector, candidate.vector) || 0 : 0;
    const negativeSimilarity = Math.max(
      0,
      ...[...rejectedVectors, ...skippedVectors]
        .map((vector) => cosineSimilarity(vector, candidate.vector) || 0),
    );
    const negativePenalty = negativeSimilarity * weights.negativeWeight;
    const fatigue = fatiguePenalty(candidate, exposureCounts);
    const quality = qualityPrior(candidate);
    const score =
      weights.longWeight * longScore +
      weights.interestWeight * interestScore +
      weights.sessionWeight * sessionScore +
      weights.qualityWeight * quality -
      negativePenalty -
      weights.fatigueWeight * fatigue;

    return {
      ...candidate,
      score: Number.isFinite(score) ? score : 0,
      scoreBreakdown: {
        long: longScore,
        interest: interestScore,
        session: sessionScore,
        quality,
        negativePenalty,
        fatigue,
      },
    };
  }).sort((left, right) => right.score - left.score);
}

export function diversifyWithEmbeddingMmr(candidates, limit, lambda = 0.72, mediaRatio = null) {
  const remaining = [...candidates];
  const selected = [];
  const targetMovieCount = mediaRatio
    ? Math.round(limit * Math.max(0, Math.min(1, mediaRatio.movieShare)))
    : null;
  const targetTvCount = targetMovieCount == null ? null : limit - targetMovieCount;
  while (remaining.length && selected.length < limit) {
    const selectedMovieCount = selected.filter((item) => item.type === "movie").length;
    const selectedTvCount = selected.length - selectedMovieCount;
    const eligible = remaining.filter((candidate) => {
      if (targetMovieCount == null) return true;
      if (candidate.type === "movie" && selectedMovieCount >= targetMovieCount) return false;
      if (candidate.type === "tv" && selectedTvCount >= targetTvCount) return false;
      return true;
    });
    const pool = eligible.length ? eligible : remaining;
    let bestIndex = 0;
    let bestValue = -Infinity;
    pool.forEach((candidate) => {
      const index = remaining.indexOf(candidate);
      const similarity = selected.length
        ? Math.max(...selected.map((item) => cosineSimilarity(item.vector, candidate.vector) || 0))
        : 0;
      const clusterPenalty = selected.some(
        (item) => item.clusterId != null && item.clusterId === candidate.clusterId,
      ) ? 0.08 : 0;
      const value = lambda * candidate.score - (1 - lambda) * similarity - clusterPenalty;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    });
    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push({ ...chosen, mmrScore: bestValue, rank: selected.length + 1 });
  }
  return selected;
}
