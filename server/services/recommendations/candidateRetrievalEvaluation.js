import {
  buildTemporalHoldout,
  normalizeKey,
} from "./recommendationEvaluationProtocol.js";
import { evaluateCandidateRetrieval } from "./candidateEvaluation.js";

function getRelevantIdsByMediaType(relevantIds, mediaType) {
  return new Set(
    [...relevantIds].filter((key) => key.startsWith(`${mediaType}:`)),
  );
}

function summarizeStage(name, candidates, relevantIds) {
  const metrics = evaluateCandidateRetrieval({ candidates, relevantIds });

  return {
    name,
    ...metrics,
  };
}

/**
 * Evaluate a retrieval implementation against future positive interactions.
 *
 * The callback receives only the training portion of the history. This keeps
 * future positives out of the retrieval profile and makes the result a true
 * temporal holdout rather than an in-sample coverage check.
 */
export async function evaluateTemporalCandidateRetrieval({
  history,
  retrieveCandidates,
  mediaType,
  holdoutOptions,
}) {
  if (typeof retrieveCandidates !== "function") {
    throw new TypeError("retrieveCandidates must be a function");
  }

  const holdout = buildTemporalHoldout(history, holdoutOptions);
  const relevantIds = getRelevantIdsByMediaType(holdout.relevantIds, mediaType);

  if (!holdout.evaluated || relevantIds.size === 0) {
    return {
      evaluated: false,
      reason: holdout.reason || "no-positive-holdout",
      mediaType,
      cutoff: holdout.cutoff,
      trainCount: holdout.train.length,
      testCount: holdout.test.length,
      relevantCount: relevantIds.size,
      stages: [],
    };
  }

  const result = await retrieveCandidates({
    history: holdout.train,
    relevantIds,
    mediaType,
    holdout,
  });

  const stages = Array.isArray(result)
    ? [summarizeStage("final", result, relevantIds)]
    : Object.entries(result || {}).map(([name, candidates]) =>
        summarizeStage(name, candidates, relevantIds),
      );

  return {
    evaluated: true,
    reason: null,
    mediaType,
    cutoff: holdout.cutoff,
    trainCount: holdout.train.length,
    testCount: holdout.test.length,
    relevantCount: relevantIds.size,
    stages,
  };
}

export function buildRetrievalStageComparison(stages) {
  return stages
    .map((stage) => ({
      name: stage.name,
      candidateCount: stage.candidateCount,
      relevantCount: stage.relevantCount,
      coveredRelevantCount: stage.coveredRelevantCount,
      recall: stage.recall,
      sourceRecall: stage.sourceRecall,
    }))
    .sort((a, b) => b.recall - a.recall || a.name.localeCompare(b.name));
}

export function getCandidateKeys(candidates) {
  return new Set(
    candidates.map((candidate) => normalizeKey(candidate.type, candidate.id)),
  );
}
