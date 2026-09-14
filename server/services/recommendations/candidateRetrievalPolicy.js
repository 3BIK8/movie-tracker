const DISCOVERY_PAGE_LIMITS = Object.freeze({
  genres: 2,
  studios: 2,
  keywords: 2,
});

const MAX_ENRICHMENT_MULTIPLIER = 6;
const MIN_SOURCE_BUDGET = 20;
const MAX_SOURCE_BUDGET = 48;
const MAX_ENRICHMENT_PER_SOURCE_TYPE = 90;

let enrichmentBudgetOverride = null;

export function getDiscoveryPageCount(sourceType) {
  return DISCOVERY_PAGE_LIMITS[sourceType] || 1;
}

export function setEnrichmentBudgetOverride(budget) {
  enrichmentBudgetOverride =
    Number.isInteger(budget) && budget > 0 ? budget : null;
}

export function getEnrichmentBudget(limit) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 100;
  if (enrichmentBudgetOverride !== null) return enrichmentBudgetOverride;
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

  if (positiveConnectionCount <= MIN_SOURCE_BUDGET) return MIN_SOURCE_BUDGET;

  return Math.min(
    MAX_SOURCE_BUDGET,
    Math.max(MIN_SOURCE_BUDGET, Math.ceil(positiveConnectionCount * 0.6)),
  );
}

function sourceType(candidate) {
  return candidate.sources?.[0]?.type || "unknown";
}

function candidateEvidence(candidate) {
  return candidate.sources.reduce(
    (sum, source) => sum + (source.evidenceScore || 0),
    0,
  );
}

export function selectCandidatesForEnrichment(candidates, limit) {
  const budget = getEnrichmentBudget(limit);
  if (candidates.length <= budget) return candidates;

  const ranked = [...candidates].sort((a, b) => {
    const sourceDifference = b.sources.length - a.sources.length;
    if (sourceDifference !== 0) return sourceDifference;
    const evidenceDifference = candidateEvidence(b) - candidateEvidence(a);
    if (evidenceDifference !== 0) return evidenceDifference;
    return `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`);
  });

  const selected = [];
  const counts = new Map();
  const deferred = [];

  for (const candidate of ranked) {
    const type = sourceType(candidate);
    const count = counts.get(type) || 0;
    if (count < MAX_ENRICHMENT_PER_SOURCE_TYPE) {
      selected.push(candidate);
      counts.set(type, count + 1);
      if (selected.length >= budget) break;
    } else {
      deferred.push(candidate);
    }
  }

  if (selected.length < budget) {
    for (const candidate of deferred) {
      if (selected.length >= budget) break;
      selected.push(candidate);
    }
  }

  return selected.slice(0, budget);
}

export const CANDIDATE_RETRIEVAL_LIMITS = Object.freeze({
  discoveryPages: DISCOVERY_PAGE_LIMITS,
  maxEnrichmentMultiplier: MAX_ENRICHMENT_MULTIPLIER,
  minSourceBudget: MIN_SOURCE_BUDGET,
  maxSourceBudget: MAX_SOURCE_BUDGET,
  maxEnrichmentPerSourceType: MAX_ENRICHMENT_PER_SOURCE_TYPE,
});
