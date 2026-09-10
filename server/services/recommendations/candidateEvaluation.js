function normalizeKey(type, id) {
  return `${String(type || "").trim().toLowerCase()}:${String(id ?? "").trim()}`;
}

function getRelevantCandidateIds(candidates, relevantIds) {
  return new Set(
    candidates
      .filter((candidate) => relevantIds.has(normalizeKey(candidate.type, candidate.id)))
      .map((candidate) => normalizeKey(candidate.type, candidate.id)),
  );
}

export function candidateRecall(candidates, relevantIds) {
  if (relevantIds.size === 0) return 0;
  return getRelevantCandidateIds(candidates, relevantIds).size / relevantIds.size;
}

export function candidateSourceRecall(candidates, relevantIds) {
  const sourceStats = new Map();
  const sourceTypesByCandidate = new Map();

  for (const candidate of candidates) {
    const candidateKey = normalizeKey(candidate.type, candidate.id);
    if (!relevantIds.has(candidateKey)) continue;

    const sourceTypes = new Set(
      (candidate.sources || []).map((source) => source.type),
    );
    sourceTypesByCandidate.set(candidateKey, sourceTypes);

    for (const sourceType of sourceTypes) {
      if (!sourceStats.has(sourceType)) {
        sourceStats.set(sourceType, {
          hits: 0,
          uniqueHits: 0,
          recall: 0,
          marginalRecall: 0,
        });
      }
      sourceStats.get(sourceType).hits += 1;
    }
  }

  for (const sourceTypes of sourceTypesByCandidate.values()) {
    if (sourceTypes.size !== 1) continue;
    const [sourceType] = sourceTypes;
    sourceStats.get(sourceType).uniqueHits += 1;
  }

  for (const stats of sourceStats.values()) {
    stats.recall = relevantIds.size === 0 ? 0 : stats.hits / relevantIds.size;
    stats.marginalRecall =
      relevantIds.size === 0 ? 0 : stats.uniqueHits / relevantIds.size;
  }

  return Object.fromEntries(
    [...sourceStats.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function evaluateCandidateRetrieval({ candidates, relevantIds }) {
  const coveredIds = getRelevantCandidateIds(candidates, relevantIds);

  return {
    candidateCount: candidates.length,
    relevantCount: relevantIds.size,
    coveredRelevantCount: coveredIds.size,
    recall: candidateRecall(candidates, relevantIds),
    sourceRecall: candidateSourceRecall(candidates, relevantIds),
  };
}

export { normalizeKey };
