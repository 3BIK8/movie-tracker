import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { analyzeHistory } from "./historyAnalyzer.js";
import { createTasteProfile } from "./tasteProfile.js";
import { calculateExplorationRatio } from "./explorationPolicy.js";
import { generateCandidates } from "./candidateService.js";
import { scoreCandidates } from "./recommendationScorer.js";
import { applyTemporalScoring } from "./temporalRecommendationScoring.js";
import { diversifyRankedCandidates } from "./recommendationDiversifier.js";
import { mixRecommendationPools } from "./recommendationMixer.js";
import { validateRecommendationOutput } from "./recommendationInvariants.js";
import { createMediaKey, normalizeWatchHistory } from "../../utils/mediaIdentity.js";
import { mapWithConcurrency } from "../../utils/runWithConcurrency.js";
import { getTmdbMetrics, runWithTmdbMetrics } from "../../utils/tmdbMetrics.js";
import {
  calculateRecommendationCapacity,
  countRecentRecommendationExposures,
  RECOMMENDATION_PAGE_SIZE,
} from "./recommendationCapacity.js";

const HISTORY_ENRICHMENT_CONCURRENCY = 6;
const BASE_DIVERSITY_LAMBDA = 0.72;
const MIN_DIVERSITY_LAMBDA = 0.52;
const MAX_DIVERSITY_LAMBDA = 0.78;

function removeKnownRecommendations(recommendations, knownIds) {
  return recommendations.filter(
    (recommendation) => !knownIds.has(createMediaKey(recommendation.type, recommendation.id)),
  );
}

// Generic exploration candidates are intentionally excluded here. This endpoint
// answers "what might I have watched?" rather than "what should I watch next?".
// History-grounded expansion remains valid because those candidates are derived
// from connections already present in the user's library.
function removeGenericExplorationCandidates(candidates) {
  return candidates.filter((candidate) =>
    (candidate.sources || []).some((source) => source?.type !== "exploration"),
  );
}

export function isGroundedExploitation(candidate) {
  if (candidate.pool !== "exploitation") return true;
  if (candidate.hardNegative || candidate.recommendationScore <= 0) return false;
  return (candidate.connectionEvidence || []).some((evidence) => evidence.score > 0);
}

function enforceRecommendationGrounding(candidates) {
  return candidates.filter(isGroundedExploitation);
}

function calculateAdaptiveDiversityLambda(candidates) {
  const scores = candidates
    .map((candidate) => Number(candidate.recommendationScore))
    .filter(Number.isFinite);
  if (scores.length < 2) return BASE_DIVERSITY_LAMBDA;

  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length;
  const standardDeviation = Math.sqrt(variance);
  const pressure = Math.min(1, standardDeviation / 2.5);

  return Math.max(
    MIN_DIVERSITY_LAMBDA,
    Math.min(MAX_DIVERSITY_LAMBDA, BASE_DIVERSITY_LAMBDA - pressure * 0.2),
  );
}

function diversifyRecommendationSet(candidates) {
  if (!candidates.length) return { candidates: [], lambda: BASE_DIVERSITY_LAMBDA };
  const lambda = calculateAdaptiveDiversityLambda(candidates);
  return {
    candidates: diversifyRankedCandidates(candidates, candidates.length, lambda),
    lambda,
  };
}

export async function analyzeWatchHistory(history, feedback = null) {
  const pipelineStartedAt = Date.now();
  const canonicalHistory = normalizeWatchHistory(history);
  const effectiveFeedback = feedback || null;
  const recommendationCapacity = calculateRecommendationCapacity({
    historyCount: canonicalHistory.length,
    recentExposureCount: countRecentRecommendationExposures(effectiveFeedback),
    pageSize: RECOMMENDATION_PAGE_SIZE,
  });

  const historyEnrichmentStartedAt = Date.now();
  const enrichedResults = await mapWithConcurrency(
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
      } catch (error) {
        console.warn(`Failed to enrich history item ${historyItem.type}:${historyItem.id}`, error.message);
        return null;
      }
    },
    HISTORY_ENRICHMENT_CONCURRENCY,
  );
  const historyEnrichmentMs = Date.now() - historyEnrichmentStartedAt;

  const enrichedHistory = enrichedResults.filter(Boolean);
  const profileStartedAt = Date.now();
  const profile = analyzeHistory(enrichedHistory, effectiveFeedback);
  const tasteProfile = createTasteProfile(profile);
  const movieExplorationRatio = calculateExplorationRatio(profile.movies.strength);
  const tvExplorationRatio = calculateExplorationRatio(profile.tv.strength);
  const profileMs = Date.now() - profileStartedAt;

  const candidateGenerationStartedAt = Date.now();
  const { candidates, tmdbMetrics: candidateTmdbMetrics, candidateDiagnostics } =
    await runWithTmdbMetrics(async () => {
      const movieDiagnostics = {};
      const tvDiagnostics = {};
      const [movieCandidates, tvCandidates] = await Promise.all([
        generateCandidates(profile.movies.connections, enrichedHistory, "movie", recommendationCapacity, movieDiagnostics),
        generateCandidates(profile.tv.connections, enrichedHistory, "tv", recommendationCapacity, tvDiagnostics),
      ]);
      return {
        candidates: [movieCandidates, tvCandidates],
        candidateDiagnostics: { movies: movieDiagnostics, tv: tvDiagnostics },
        tmdbMetrics: getTmdbMetrics(),
      };
    });
  const [movieCandidates, tvCandidates] = candidates;
  const historicalMovieCandidates = removeGenericExplorationCandidates(movieCandidates);
  const historicalTvCandidates = removeGenericExplorationCandidates(tvCandidates);
  const candidateGenerationMs = Date.now() - candidateGenerationStartedAt;

  const rankingStartedAt = Date.now();
  const [scoredMovies, scoredTv] = [
    applyTemporalScoring(scoreCandidates(historicalMovieCandidates, enrichedHistory, effectiveFeedback), profile.movies),
    applyTemporalScoring(scoreCandidates(historicalTvCandidates, enrichedHistory, effectiveFeedback), profile.tv),
  ];
  const groundedMovies = enforceRecommendationGrounding(scoredMovies);
  const groundedTv = enforceRecommendationGrounding(scoredTv);

  const rankRecommendationPools = (poolCandidates) => {
    const diversified = diversifyRecommendationSet(poolCandidates);
    const exploitation = diversified.candidates.filter((candidate) => candidate.pool === "exploitation");
    const exploration = diversified.candidates.filter((candidate) => candidate.pool === "exploration");
    return {
      exploitation,
      exploration,
      lambda: diversified.lambda,
      counts: {
        total: poolCandidates.length,
        exploitation: exploitation.length,
        exploration: exploration.length,
      },
    };
  };

  const moviePools = rankRecommendationPools(groundedMovies);
  const tvPools = rankRecommendationPools(groundedTv);
  const diversifiedMovies = mixRecommendationPools(moviePools.exploitation, moviePools.exploration, recommendationCapacity, movieExplorationRatio);
  const diversifiedTv = mixRecommendationPools(tvPools.exploitation, tvPools.exploration, recommendationCapacity, tvExplorationRatio);
  const rankingMs = Date.now() - rankingStartedAt;

  const knownIds = new Set(
    canonicalHistory
      .filter((item) => ["watched", "to_watch", "not_sure"].includes(item.status))
      .map((item) => createMediaKey(item.type, item.id)),
  );
  const safeMovies = removeKnownRecommendations(diversifiedMovies, knownIds);
  const safeTv = removeKnownRecommendations(diversifiedTv, knownIds);

  validateRecommendationOutput(safeMovies, {
    mediaType: "movie",
    limit: recommendationCapacity,
    knownIds,
    explorationRatio: movieExplorationRatio,
  });
  validateRecommendationOutput(safeTv, {
    mediaType: "tv",
    limit: recommendationCapacity,
    knownIds,
    explorationRatio: tvExplorationRatio,
  });

  const generationId = new Date().toISOString();
  const attachGenerationId = (recommendations) =>
    recommendations.map((recommendation) => ({ ...recommendation, generationId }));

  const finalMovies = attachGenerationId(safeMovies);
  const finalTv = attachGenerationId(safeTv);

  return {
    profile,
    tasteProfile,
    explorationPolicy: {
      movies: { ratio: movieExplorationRatio, strength: profile.movies.strength },
      tv: { ratio: tvExplorationRatio, strength: profile.tv.strength },
    },
    recommendationDiagnostics: {
      capacity: recommendationCapacity,
      pageSize: RECOMMENDATION_PAGE_SIZE,
      recentExposureCount: countRecentRecommendationExposures(effectiveFeedback),
      movies: {
        historyItems: canonicalHistory.filter((item) => item.type === "movie").length,
        ratedItems: enrichedHistory.filter((item) => item.type === "movie" && item.status === "watched" && item.rating).length,
        candidateCounts: moviePools.counts,
        candidatePhases: candidateDiagnostics.movies,
        diversityLambda: moviePools.lambda,
        feedbackExposureCount: (effectiveFeedback?.exposures || []).filter((item) => item.type === "movie").length,
        finalExploitation: finalMovies.filter((item) => item.pool === "exploitation").length,
        finalExploration: finalMovies.filter((item) => item.pool === "exploration").length,
      },
      tv: {
        historyItems: canonicalHistory.filter((item) => item.type === "tv").length,
        ratedItems: enrichedHistory.filter((item) => item.type === "tv" && item.status === "watched" && item.rating).length,
        candidateCounts: tvPools.counts,
        candidatePhases: candidateDiagnostics.tv,
        diversityLambda: tvPools.lambda,
        feedbackExposureCount: (effectiveFeedback?.exposures || []).filter((item) => item.type === "tv").length,
        finalExploitation: finalTv.filter((item) => item.pool === "exploitation").length,
        finalExploration: finalTv.filter((item) => item.pool === "exploration").length,
      },
      timingMs: {
        historyEnrichment: historyEnrichmentMs,
        profile: profileMs,
        candidateGeneration: candidateGenerationMs,
        candidateTmdb: candidateTmdbMetrics,
        ranking: rankingMs,
        total: Date.now() - pipelineStartedAt,
      },
    },
    recommendations: {
      movies: finalMovies,
      tv: finalTv,
    },
  };
}
