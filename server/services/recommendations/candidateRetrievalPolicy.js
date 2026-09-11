const DISCOVERY_PAGE_LIMITS = Object.freeze({
  genres: 2,
  studios: 2,
  keywords: 2,
});

const MAX_ENRICHMENT_MULTIPLIER = 6;

export function getDiscoveryPageCount(sourceType) {
  return DISCOVERY_PAGE_LIMITS[sourceType] || 1;
}

export function getEnrichmentBudget(limit) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 100;
  return normalizedLimit * MAX_ENRICHMENT_MULTIPLIER;
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
});
