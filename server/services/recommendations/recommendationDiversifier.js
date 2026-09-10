import { createMediaKey } from "../../utils/mediaIdentity.js";

const DIVERSITY_CONNECTION_TYPES = new Set([
  "franchise",
  "actor",
  "studio",
  "director",
  "genre",
]);

const DEFAULT_LAMBDA = 0.8;

function getDiversityKeys(candidate) {
  return new Set(
    (candidate.connections || [])
      .filter((connection) => DIVERSITY_CONNECTION_TYPES.has(connection.type))
      .map((connection) => `${connection.type}:${connection.value}`),
  );
}

function calculateJaccardSimilarity(a, b) {
  const aKeys = getDiversityKeys(a);
  const bKeys = getDiversityKeys(b);

  if (aKeys.size === 0 && bKeys.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const key of aKeys) {
    if (bKeys.has(key)) {
      intersection += 1;
    }
  }

  const union = new Set([...aKeys, ...bKeys]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeRelevance(candidates) {
  const scores = candidates.map((candidate) => candidate.recommendationScore);
  const max = Math.max(...scores);
  const min = Math.min(...scores);

  if (max === min) {
    return new Map(candidates.map((candidate) => [createMediaKey(candidate.type, candidate.id), 1]));
  }

  return new Map(
    candidates.map((candidate) => [
      createMediaKey(candidate.type, candidate.id),
      (candidate.recommendationScore - min) / (max - min),
    ]),
  );
}

function compareTieBreakers(a, b) {
  if (b.recommendationScore !== a.recommendationScore) {
    return b.recommendationScore - a.recommendationScore;
  }

  return createMediaKey(a.type, a.id).localeCompare(
    createMediaKey(b.type, b.id),
  );
}

export function diversifyRankedCandidates(
  candidates,
  limit = candidates.length,
  lambda = DEFAULT_LAMBDA,
) {
  if (!Array.isArray(candidates)) {
    throw new TypeError("Candidates must be an array.");
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Diversity limit must be a positive integer.");
  }

  if (candidates.length === 0) {
    return [];
  }

  if (lambda < 0 || lambda > 1) {
    throw new RangeError("Diversity lambda must be between 0 and 1.");
  }

  const relevance = normalizeRelevance(candidates);
  const remaining = [...candidates];
  const selected = [];

  while (remaining.length > 0 && selected.length < limit) {
    let bestIndex = 0;
    let bestMmr = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const key = createMediaKey(candidate.type, candidate.id);
      const maxSimilarity = selected.reduce(
        (max, selectedCandidate) =>
          Math.max(max, calculateJaccardSimilarity(candidate, selectedCandidate)),
        0,
      );

      const mmr = lambda * relevance.get(key) - (1 - lambda) * maxSimilarity;

      if (
        mmr > bestMmr ||
        (mmr === bestMmr && compareTieBreakers(candidate, remaining[bestIndex]) < 0)
      ) {
        bestMmr = mmr;
        bestIndex = index;
      }
    }

    const [winner] = remaining.splice(bestIndex, 1);
    selected.push({
      ...winner,
      diversityScore: bestMmr,
    });
  }

  return selected;
}

export { calculateJaccardSimilarity };
