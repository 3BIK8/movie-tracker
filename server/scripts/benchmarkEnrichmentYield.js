import "dotenv/config";

import { getWatchHistory } from "../repositories/watchHistoryRepository.js";
import { analyzeWatchHistory } from "../services/recommendations/recommendationsService.js";
import { setEnrichmentBudgetOverride } from "../services/recommendations/candidateRetrievalPolicy.js";
import { createMediaKey } from "../utils/mediaIdentity.js";

const RECOMMENDATION_LIMIT = 100;
const DEFAULT_BUDGETS = [100, 150, 200, 250, 300, 400, 600];
const DEFAULT_RUNS = 3;
const DEFAULT_HISTORY_SIZE_TOKENS = [100, 200, "full"];
const OVERLAP_CUTS = [10, 25, 50, 100];

function parsePositiveIntegers(argumentName, fallback) {
  const argument = process.argv.find((value) => value.startsWith(`${argumentName}=`));
  if (!argument) return fallback;

  const values = argument
    .slice(`${argumentName}=`.length)
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!values.length) {
    throw new Error(`${argumentName} must contain one or more positive integers.`);
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

function parseBudgets() {
  return parsePositiveIntegers("--budgets", DEFAULT_BUDGETS);
}

function parseRuns() {
  const argument = process.argv.find((value) => value.startsWith("--runs="));
  if (!argument) return DEFAULT_RUNS;

  const runs = Number.parseInt(argument.slice("--runs=".length), 10);
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("--runs must be a positive integer.");
  }

  return runs;
}

function parseHistorySizes(historyLength) {
  const argument = process.argv.find((value) => value.startsWith("--history-sizes="));
  if (!argument) {
    return [
      ...DEFAULT_HISTORY_SIZE_TOKENS.map((value) =>
        value === "full" ? historyLength : value,
      ),
    ].filter((value) => value <= historyLength);
  }

  const values = argument
    .slice("--history-sizes=".length)
    .split(",")
    .map((value) => (value.trim().toLowerCase() === "full" ? historyLength : Number.parseInt(value, 10)))
    .filter((value) => Number.isInteger(value) && value > 0 && value <= historyLength);

  if (!values.length) {
    throw new Error("--history-sizes must contain positive sizes no larger than the available history, or 'full'.");
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

function recommendationKeys(recommendations) {
  return recommendations.map((recommendation) =>
    createMediaKey(recommendation.type, recommendation.id),
  );
}

function overlapAtCut(baselineKeys, candidateKeys, cut) {
  const baseline = new Set(baselineKeys.slice(0, cut));
  const candidate = new Set(candidateKeys.slice(0, cut));

  if (!baseline.size) return 0;

  return [...baseline].filter((key) => candidate.has(key)).length / baseline.size;
}

function calculateOverlaps(baselineKeys, candidateKeys) {
  return Object.fromEntries(
    OVERLAP_CUTS.map((cut) => [
      `top${cut}`,
      overlapAtCut(baselineKeys, candidateKeys, cut),
    ]),
  );
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function min(values) {
  return values.length ? Math.min(...values) : 0;
}

function summarizeNumeric(values) {
  return {
    mean: mean(values),
    min: min(values),
    max: values.length ? Math.max(...values) : 0,
  };
}

function summarizeBudgetRuns(runs) {
  const overlaps = Object.fromEntries(
    OVERLAP_CUTS.map((cut) => {
      const values = runs.map((run) => run.overlapWith600[`top${cut}`]);
      return [`top${cut}`, summarizeNumeric(values)];
    }),
  );

  const finalCounts = runs.map((run) => run.finalCounts);
  const candidateGenerationMs = runs.map((run) => run.candidateGenerationMs);
  const totalMs = runs.map((run) => run.totalMs);

  return {
    runs: runs.length,
    overlapWith600: overlaps,
    finalCounts: {
      movies: summarizeNumeric(finalCounts.map((value) => value.movies)),
      tv: summarizeNumeric(finalCounts.map((value) => value.tv)),
    },
    candidateGenerationMs: summarizeNumeric(candidateGenerationMs),
    totalMs: summarizeNumeric(totalMs),
  };
}

async function runProductionPipeline(history, budget) {
  setEnrichmentBudgetOverride(budget);
  const startedAt = Date.now();
  const result = await analyzeWatchHistory(history);

  return {
    budget,
    totalMs: Date.now() - startedAt,
    candidateGenerationMs: result.recommendationDiagnostics.timingMs.candidateGeneration,
    finalRecommendations: result.recommendations,
    finalCounts: {
      movies: result.recommendations.movies.length,
      tv: result.recommendations.tv.length,
    },
  };
}

async function benchmarkHistorySize(history, historySize, budgets, runs) {
  const historySlice = history.slice(0, historySize);
  const budgetRuns = new Map(budgets.map((budget) => [budget, []]));
  const baselineBudget = 600;

  if (!budgets.includes(baselineBudget)) {
    throw new Error("The budget list must include 600 so results can be compared against the production baseline.");
  }

  for (let run = 1; run <= runs; run += 1) {
    const results = new Map();

    for (const budget of budgets) {
      results.set(budget, await runProductionPipeline(historySlice, budget));
    }

    const baseline = results.get(baselineBudget);
    const baselineMovieKeys = recommendationKeys(baseline.finalRecommendations.movies);
    const baselineTvKeys = recommendationKeys(baseline.finalRecommendations.tv);

    for (const budget of budgets) {
      const result = results.get(budget);
      const movieKeys = recommendationKeys(result.finalRecommendations.movies);
      const tvKeys = recommendationKeys(result.finalRecommendations.tv);

      budgetRuns.get(budget).push({
        run,
        overlapWith600: {
          movies: calculateOverlaps(baselineMovieKeys, movieKeys),
          tv: calculateOverlaps(baselineTvKeys, tvKeys),
        },
        finalCounts: result.finalCounts,
        candidateGenerationMs: result.candidateGenerationMs,
        totalMs: result.totalMs,
      });
    }
  }

  return {
    historySize,
    runs,
    baselineBudget,
    budgets: Object.fromEntries(
      budgets.map((budget) => [budget, summarizeBudgetRuns(budgetRuns.get(budget))]),
    ),
  };
}

async function main() {
  const history = getWatchHistory();
  if (!history.length) throw new Error("No watch history is available.");

  const budgets = parseBudgets();
  const runs = parseRuns();
  const historySizes = parseHistorySizes(history.length);

  try {
    const results = [];

    for (const historySize of historySizes) {
      results.push(await benchmarkHistorySize(history, historySize, budgets, runs));
    }

    console.log(
      JSON.stringify(
        {
          historySize: history.length,
          recommendationLimit: RECOMMENDATION_LIMIT,
          budgets,
          runs,
          historySizes,
          baseline: 600,
          evaluation: "full-production-recommendation-pipeline",
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    setEnrichmentBudgetOverride(null);
  }
}

main().catch((error) => {
  setEnrichmentBudgetOverride(null);
  console.error(error);
  process.exitCode = 1;
});
