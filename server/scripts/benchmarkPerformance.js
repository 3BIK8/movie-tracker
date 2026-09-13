import "dotenv/config";

import { getWatchHistory } from "../repositories/watchHistoryRepository.js";
import { analyzeWatchHistory } from "../services/recommendations/recommendationsService.js";
import { buildNetwork } from "../services/recommendations/networkService.js";

function parseIntegerFlag(name, fallback, minimum = 1) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  if (!argument) return fallback;

  const value = Number.parseInt(argument.slice(prefix.length), 10);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`--${name} must be an integer >= ${minimum}`);
  }

  return value;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (ratio) =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];

  return {
    min: sorted[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted[sorted.length - 1],
  };
}

function getRecommendationProvenance(recommendations) {
  const directTypes = new Set([
    "actors",
    "directors",
    "genres",
    "studios",
    "keywords",
    "franchises",
  ]);

  const counts = {
    direct: 0,
    multiHop: 0,
    historyExploration: 0,
    exploration: 0,
    directOnly: 0,
    multiHopOnly: 0,
    historyOnly: 0,
    explorationOnly: 0,
    mixed: 0,
  };

  for (const recommendation of recommendations) {
    const phases = new Set();

    for (const source of recommendation.sources || []) {
      if (directTypes.has(source.type)) phases.add("direct");
      if (source.type === "multiHop") phases.add("multiHop");
      if (source.pool === "exploration" && source.type !== "exploration") {
        phases.add("historyExploration");
      }
      if (source.type === "exploration") phases.add("exploration");
    }

    for (const phase of [
      "direct",
      "multiHop",
      "historyExploration",
      "exploration",
    ]) {
      if (phases.has(phase)) counts[phase] += 1;
    }

    if (phases.size === 1) {
      const [phase] = phases;
      counts[`${phase}Only`] += 1;
    } else if (phases.size > 1) {
      counts.mixed += 1;
    }
  }

  return counts;
}

function formatResult(mode, historySize, samples, diagnostics) {
  const timings = samples.map((sample) => sample.totalMs);

  return {
    mode,
    historySize,
    samples: timings.length,
    totalMs: summarize(timings),
    stages: diagnostics,
  };
}

async function benchmarkRecommendations(history, runs) {
  const samples = [];
  let latestDiagnostics = null;
  let latestProvenance = null;

  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    const result = await analyzeWatchHistory(history);
    const totalMs = Math.round(performance.now() - startedAt);

    samples.push({ totalMs });
    latestDiagnostics = result.recommendationDiagnostics;
    latestProvenance = {
      movies: getRecommendationProvenance(result.recommendations.movies),
      tv: getRecommendationProvenance(result.recommendations.tv),
    };
  }

  return formatResult(
    "recommendations",
    history.length,
    samples,
    {
      ...latestDiagnostics,
      recommendationProvenance: latestProvenance,
    },
  );
}

async function benchmarkNetwork(history, runs) {
  const samples = [];
  let latestMeta = null;

  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    const result = await buildNetwork(history);
    const totalMs = Math.round(performance.now() - startedAt);

    samples.push({ totalMs });
    latestMeta = result.meta;
  }

  return formatResult("network", history.length, samples, latestMeta);
}

async function main() {
  const runs = parseIntegerFlag("runs", 3);
  const requestedLimit = parseIntegerFlag("history-limit", null);
  const mode = hasFlag("network") ? "network" : "recommendations";

  const fullHistory = getWatchHistory();
  const history =
    requestedLimit === null
      ? fullHistory
      : fullHistory.slice(0, requestedLimit);

  if (history.length === 0) {
    throw new Error("No watch history is available for benchmarking.");
  }

  if (requestedLimit !== null && history.length < requestedLimit) {
    console.warn(
      `Requested ${requestedLimit} history items, but only ${history.length} are available.`,
    );
  }

  const result =
    mode === "network"
      ? await benchmarkNetwork(history, runs)
      : await benchmarkRecommendations(history, runs);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
