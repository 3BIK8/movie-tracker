const DISCOVERY_PAGE_LIMITS = Object.freeze({
  genres: 2,
  studios: 2,
  keywords: 2,
});

const MAX_ENRICHMENT_MULTIPLIER = 6;
const MIN_SOURCE_BUDGET = 20;
const MAX_SOURCE_BUDGET = 48;

export function getDiscoveryPageCount(sourceType) {
  return DISCOVERY_PAGE_LIMITS[sourceType] || 1;
}

export function getEnrichmentBudget(limit) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 100;
  return normalizedLimit * MAX_ENRICHMENT_MULTIPLIER;
}

export function getSourceBudget(profile) {
  const positiveConnectionCount = Object.values(profile || {}).reduce(
    (total, values) =>
      total +
      Object.values(values || {}).filter(
        (data) => Number.isFinite(data?.evidenceScore) && data.evidenceScore > 0,
      ).length,
    0,
  );

  if (positiveConnectionCount <= MIN_SOURCE_BUDGET) {
    return MIN_SOURCE_BUDGET;
  }

  return Math.min(
    MAX_SOURCE_BUDGET,
    Math.max(MIN_SOURCE_BUDGET, Math.ceil(positiveConnectionCount * 0.6)),
  );
}

export function selectCandidatesForEnrichment(candidates, limit) {
  const budget = getEnrichmentBudget(limit);

  if (candidates.length <= budget) {
    return candidates;
  }

  return [...candidates]
    .sort((a, b) => {
      if (b.sources.length !== a.sources.length) {
        return b.sources.length - a.sources.length;
      }

      const aEvidence = a.sources.reduce(
        (sum, source) => sum + (source.evidenceScore || 0),
        0,
      );
      const bEvidence = b.sources.reduce(
        (sum, source) => sum + (source.evidenceScore || 0),
        0,
      );

      if (bEvidence !== aEvidence) {
        return bEvidence - aEvidence;
      }

      return `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`);
    })
    .slice(0, budget);
}

export const CANDIDATE_RETRIEVAL_LIMITS = Object.freeze({
  discoveryPages: DISCOVERY_PAGE_LIMITS,
  maxEnrichmentMultiplier: MAX_ENRICHMENT_MULTIPLIER,
  minSourceBudget: MIN_SOURCE_BUDGET,
  maxSourceBudget: MAX_SOURCE_BUDGET,
});
