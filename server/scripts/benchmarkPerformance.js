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

  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    const result = await analyzeWatchHistory(history);
    const totalMs = Math.round(performance.now() - startedAt);

    samples.push({ totalMs });
    latestDiagnostics = result.recommendationDiagnostics;
  }

  return formatResult(
    "recommendations",
    history.length,
    samples,
    latestDiagnostics,
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
  const requestedLimit = parseIntegerFlag("history-limit", Number.MAX_SAFE_INTEGER);
  const mode = hasFlag("network") ? "network" : "recommendations";

  const fullHistory = getWatchHistory();
  const history = fullHistory.slice(0, requestedLimit);

  if (history.length === 0) {
    throw new Error("No watch history is available for benchmarking.");
  }

  if (history.length < requestedLimit) {
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
