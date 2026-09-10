import { createMediaKey, normalizeMediaRef } from "../../utils/mediaIdentity.js";

const DEFAULT_EXPLORATION_RATIO = 0.2;

export function validateRecommendationOutput(
  recommendations,
  {
    mediaType,
    limit,
    knownIds = new Set(),
    explorationRatio = DEFAULT_EXPLORATION_RATIO,
  } = {},
) {
  if (!Array.isArray(recommendations)) {
    throw new TypeError("Recommendation output must be an array.");
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Recommendation output limit must be a positive integer.");
  }

  if (explorationRatio < 0 || explorationRatio > 1) {
    throw new RangeError("Exploration ratio must be between 0 and 1.");
  }

  const normalizedMediaType = mediaType
    ? normalizeMediaRef(mediaType, 1).type
    : null;
  const seen = new Set();

  if (recommendations.length > limit) {
    throw new Error(
      `Recommendation output exceeds limit: ${recommendations.length} > ${limit}`,
    );
  }

  for (const recommendation of recommendations) {
    const ref = normalizeMediaRef(recommendation?.type, recommendation?.id);
    const key = createMediaKey(ref.type, ref.id);

    if (normalizedMediaType && ref.type !== normalizedMediaType) {
      throw new Error(
        `Recommendation media type mismatch: expected ${normalizedMediaType}, got ${ref.type}`,
      );
    }

    if (seen.has(key)) {
      throw new Error(`Duplicate recommendation identity: ${key}`);
    }

    if (knownIds.has(key)) {
      throw new Error(`Known media leaked into recommendations: ${key}`);
    }

    if (!Number.isFinite(recommendation.recommendationScore)) {
      throw new Error(`Invalid recommendation score: ${key}`);
    }

    if (!Number.isFinite(recommendation.diversityScore)) {
      throw new Error(`Invalid diversity score: ${key}`);
    }

    seen.add(key);
  }

  const explorationLimit = Math.floor(limit * explorationRatio);
  const explorationCount = recommendations.filter(
    (recommendation) => recommendation.pool === "exploration",
  ).length;

  if (explorationCount > explorationLimit) {
    throw new Error(
      `Recommendation exploration quota exceeded: ${explorationCount} > ${explorationLimit}`,
    );
  }

  return recommendations;
}

export { DEFAULT_EXPLORATION_RATIO };
