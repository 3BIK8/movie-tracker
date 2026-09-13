import "dotenv/config";

import { getWatchHistory } from "../repositories/watchHistoryRepository.js";
import { getMediaMetadata } from "../services/recommendations/mediaMetadataService.js";
import { getMediaConnections } from "../services/recommendations/connectionExtractor.js";
import { analyzeHistory } from "../services/recommendations/historyAnalyzer.js";
import { generateCandidates } from "../services/recommendations/candidateService.js";
import { scoreCandidates } from "../services/recommendations/recommendationScorer.js";
import { applyTemporalScoring } from "../services/recommendations/temporalRecommendationScoring.js";
import { isGroundedExploitation } from "../services/recommendations/recommendationsService.js";
import {
  setEnrichmentBudgetOverride,
} from "../services/recommendations/candidateRetrievalPolicy.js";
import { createMediaKey, normalizeWatchHistory } from "../utils/mediaIdentity.js";
import { mapWithConcurrency } from "../utils/runWithConcurrency.js";

const HISTORY_ENRICHMENT_CONCURRENCY = 6;
const RECOMMENDATION_LIMIT = 100;
const DEFAULT_BUDGETS = [100, 200, 300, 400, 500, 600];
const OVERLAP_CUTS = [10, 25, 50, 100];

function parseBudgets() {
  const argument = process.argv.find((value) => value.startsWith("--budgets="));
  if (!argument) return DEFAULT_BUDGETS;

  const budgets = argument
    .slice("--budgets=".length)
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!budgets.length) {
    throw new Error("--budgets must contain one or more positive integers.");
  }

  return [...new Set(budgets)].sort((a, b) => a - b);
}

function summarizeScores(candidates) {
  const scores = candidates
    .map((candidate) => Number(candidate.recommendationScore))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!scores.length) return { count: 0 };

  const percentile = (ratio) =>
    scores[Math.min(scores.length - 1, Math.floor((scores.length - 1) * ratio))];

  return {
    count: scores.length,
    positive: scores.filter((score) => score > 0).length,
    min: scores[0],
    p10: percentile(0.1),
    p25: percentile(0.25),
    p50: percentile(0.5),
    p75: percentile(0.75),
    p90: percentile(0.9),
    p95: percentile(0.95),
    max: scores[scores.length - 1],
  };
}

function getProvenance(candidate) {
  const hasDirect = candidate.sources.some(
    (source) => source.pool !== "exploration" && source.type !== "exploration",
  );
  const hasMultiHop = candidate.sources.some(
    (source) => source.type === "multiHop" || source.type === "multi_hop",
  );
  const hasHistoryExploration = candidate.sources.some(
    (source) => source.pool === "exploration" && source.type !== "exploration",
  );
  const hasExploration = candidate.sources.some(
    (source) => source.type === "exploration",
  );

  return { hasDirect, hasMultiHop, hasHistoryExploration, hasExploration };
}

function summarizeProvenance(candidates) {
  const summary = {
    direct: 0,
    multiHop: 0,
    historyExploration: 0,
    exploration: 0,
    mixed: 0,
  };

  for (const candidate of candidates) {
    const provenance = getProvenance(candidate);
    const count = Object.values(provenance).filter(Boolean).length;

    if (provenance.hasDirect) summary.direct += 1;
    if (provenance.hasMultiHop) summary.multiHop += 1;
    if (provenance.hasHistoryExploration) summary.historyExploration += 1;
    if (provenance.hasExploration) summary.exploration += 1;
    if (count > 1) summary.mixed += 1;
  }

  return summary;
}

function analyzeYield(scored, grounded) {
  const final = grounded.slice(0, RECOMMENDATION_LIMIT);
  const finalKeys = new Set(
    final.map((candidate) => createMediaKey(candidate.type, candidate.id)),
  );
  const discarded = scored.filter(
    (candidate) =>
      !finalKeys.has(createMediaKey(candidate.type, candidate.id)),
  );

  return {
    scored: scored.length,
    grounded: grounded.length,
    groundingRejected: scored.length - grounded.length,
    final: final.length,
    discardedAfterScoring: discarded.length,
    scoreDistribution: summarizeScores(scored),
    groundedScoreDistribution: summarizeScores(grounded),
    discardedScoreDistribution: summarizeScores(discarded),
    provenance: summarizeProvenance(final),
    finalKeys: final.map((candidate) =>
      createMediaKey(candidate.type, candidate.id),
    ),
  };
}

function overlapAtCut(baselineKeys, candidateKeys, cut) {
  const baseline = new Set(baselineKeys.slice(0, cut));
  const candidate = new Set(candidateKeys.slice(0, cut));

  if (!baseline.size) return 0;

  return [...baseline].filter((key) => candidate.has(key)).length / baseline.size;
}

function addBaselineOverlap(results, baseline) {
  for (const result of results) {
    result.overlapWith600 = Object.fromEntries(
      OVERLAP_CUTS.map((cut) => [
        `top${cut}`,
        overlapAtCut(baseline.finalKeys, result.finalKeys, cut),
      ]),
    );
  }
}

async function enrichHistory(history) {
  const canonicalHistory = normalizeWatchHistory(history);
  const results = await mapWithConcurrency(
    canonicalHistory,
    async (historyItem) => {
      try {
        const metadata = await getMediaMetadata(historyItem.type, historyItem.id);
        if (!metadata) return null;
        return {
          ...historyItem,
          ...metadata,
          rating: historyItem.rating,
          tmdbRating: metadata.rating,
          connections: getMediaConnections(metadata),
        };
      } catch {
        return null;
      }
    },
    HISTORY_ENRICHMENT_CONCURRENCY,
  );

  return { canonicalHistory, enrichedHistory: results.filter(Boolean) };
}

async function benchmarkBudget(mediaType, profile, history, budget) {
  setEnrichmentBudgetOverride(budget);
  const diagnostics = {};

  const candidates = await generateCandidates(
    profile,
    history,
    mediaType,
    RECOMMENDATION_LIMIT,
    diagnostics,
  );

  const scored = applyTemporalScoring(
    scoreCandidates(candidates, history, null),
    profile,
  );
  const grounded = scored.filter(isGroundedExploitation);
  const yieldAnalysis = analyzeYield(scored, grounded);

  return {
    budget,
    candidateGeneration: diagnostics,
    yield: {
      ...yieldAnalysis,
      finalKeys: undefined,
    },
    finalKeys: yieldAnalysis.finalKeys,
  };
}

async function benchmarkMediaType(mediaType, profile, history, budgets) {
  const results = [];

  for (const budget of budgets) {
    results.push(await benchmarkBudget(mediaType, profile, history, budget));
  }

  const baseline = results.find((result) => result.budget === 600) ||
    results[results.length - 1];

  addBaselineOverlap(results, baseline);

  for (const result of results) {
    delete result.finalKeys;
  }

  return {
    baselineBudget: baseline.budget,
    budgets: results,
  };
}

async function main() {
  const budgets = parseBudgets();
  const history = getWatchHistory();
  if (!history.length) throw new Error("No watch history is available.");

  const { enrichedHistory } = await enrichHistory(history);
  const profile = analyzeHistory(enrichedHistory);

  const [movies, tv] = await Promise.all([
    benchmarkMediaType("movie", profile.movies.connections, enrichedHistory, budgets),
    benchmarkMediaType("tv", profile.tv.connections, enrichedHistory, budgets),
  ]);

  setEnrichmentBudgetOverride(null);

  console.log(
    JSON.stringify(
      {
        historySize: history.length,
        recommendationLimit: RECOMMENDATION_LIMIT,
        budgets,
        baseline: 600,
        movies,
        tv,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  setEnrichmentBudgetOverride(null);
  console.error(error);
  process.exitCode = 1;
});
