import { createMediaKey, normalizeMediaRef } from "../../utils/mediaIdentity.js";

export function validateCandidateOutput(
  candidates,
  { mediaType, limit, knownIds = new Set() } = {},
) {
  if (!Array.isArray(candidates)) {
    throw new TypeError("Candidate output must be an array.");
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Candidate output limit must be a positive integer.");
  }

  const normalizedMediaType = mediaType
    ? normalizeMediaRef(mediaType, 1).type
    : null;
  const seen = new Set();
  const explorationLimit = Math.floor(limit * 0.4);

  if (candidates.length > limit) {
    throw new Error(
      `Candidate output exceeds limit: ${candidates.length} > ${limit}`,
    );
  }

  for (const candidate of candidates) {
    const ref = normalizeMediaRef(candidate?.type, candidate?.id);
    const key = createMediaKey(ref.type, ref.id);

    if (normalizedMediaType && ref.type !== normalizedMediaType) {
      throw new Error(
        `Candidate media type mismatch: expected ${normalizedMediaType}, got ${ref.type}`,
      );
    }

    if (seen.has(key)) {
      throw new Error(`Duplicate candidate identity: ${key}`);
    }

    if (knownIds.has(key)) {
      throw new Error(`Known media leaked into candidate output: ${key}`);
    }

    seen.add(key);
  }

  const explorationCount = candidates.filter(
    (candidate) => candidate.pool === "exploration",
  ).length;

  if (explorationCount > explorationLimit) {
    throw new Error(
      `Candidate exploration quota exceeded: ${explorationCount} > ${explorationLimit}`,
    );
  }

  return candidates;
}
