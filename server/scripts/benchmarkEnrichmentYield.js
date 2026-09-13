import "dotenv/config";

import { getWatchHistory } from "../repositories/watchHistoryRepository.js";
import { getMediaMetadata } from "../services/recommendations/mediaMetadataService.js";
import { getMediaConnections } from "../services/recommendations/connectionExtractor.js";
import { analyzeHistory } from "../services/recommendations/historyAnalyzer.js";
import { generateCandidates } from "../services/recommendations/candidateService.js";
import { scoreCandidates } from "../services/recommendations/recommendationScorer.js";
import { applyTemporalScoring } from "../services/recommendations/temporalRecommendationScoring.js";
import { isGroundedExploitation } from "../services/recommendations/recommendationsService.js";
import { createMediaKey, normalizeWatchHistory } from "../utils/mediaIdentity.js";
import { mapWithConcurrency } from "../utils/runWithConcurrency.js";

const HISTORY_ENRICHMENT_CONCURRENCY = 6;
const ENRICHMENT_LIMIT = 600;

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

function analyzeYield(scored, grounded, final) {
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
  };
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

async function benchmarkMediaType(mediaType, profile, history) {
  const diagnostics = {};
  const candidates = await generateCandidates(
    profile,
    history,
    mediaType,
    ENRICHMENT_LIMIT,
    diagnostics,
  );

  const scored = applyTemporalScoring(
    scoreCandidates(candidates, history, null),
    profile,
  );
  const grounded = scored.filter(isGroundedExploitation);

  return {
    candidateGeneration: diagnostics,
    yield: analyzeYield(scored, grounded, grounded.slice(0, 100)),
  };
}

async function main() {
  const history = getWatchHistory();
  if (!history.length) throw new Error("No watch history is available.");

  const { enrichedHistory } = await enrichHistory(history);
  const profile = analyzeHistory(enrichedHistory);

  const [movies, tv] = await Promise.all([
    benchmarkMediaType("movie", profile.movies.connections, enrichedHistory),
    benchmarkMediaType("tv", profile.tv.connections, enrichedHistory),
  ]);

  console.log(
    JSON.stringify(
      {
        historySize: history.length,
        enrichmentLimit: ENRICHMENT_LIMIT,
        movies,
        tv,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
