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

const RECOMMENDATION_LIMIT = 100;
const HISTORY_ENRICHMENT_CONCURRENCY = 6;
const DIVERSITY_LAMBDA = 0.8;

function removeKnownRecommendations(recommendations, knownIds) {
  return recommendations.filter(
    (recommendation) =>
      !knownIds.has(createMediaKey(recommendation.type, recommendation.id)),
  );
}

function isGroundedExploitation(candidate) {
  if (candidate.pool !== "exploitation") {
    return true;
  }

  if (candidate.hardNegative || candidate.recommendationScore <= 0) {
    return false;
  }

  const positiveConnectionEvidence = (candidate.connectionEvidence || []).some(
    (evidence) => evidence.score > 0,
  );

  const positiveHistoryAnchor = (candidate.historyAnchorScore || 0) > 0;

  return positiveConnectionEvidence || positiveHistoryAnchor;
}

function enforceRecommendationGrounding(candidates) {
  return candidates.filter(isGroundedExploitation);
}

export async function analyzeWatchHistory(history, feedback = null) {
  const canonicalHistory = normalizeWatchHistory(history);

  const enrichedResults = await mapWithConcurrency(
    canonicalHistory,
    async (historyItem) => {
      try {
        const metadata = await getMediaMetadata(historyItem.type, historyItem.id);

        if (!metadata) {
          return null;
        }

        return {
          ...historyItem,
          ...metadata,
          rating: historyItem.rating,
          tmdbRating: metadata.rating,
          connections: getMediaConnections(metadata),
        };
      } catch (error) {
        console.warn(
          `Failed to enrich history item ${historyItem.type}:${historyItem.id}`,
          error.message,
        );
        return null;
      }
    },
    HISTORY_ENRICHMENT_CONCURRENCY,
  );

  const enrichedHistory = enrichedResults.filter(Boolean);
  const profile = analyzeHistory(enrichedHistory, feedback);
  const tasteProfile = createTasteProfile(profile);
  const movieExplorationRatio = calculateExplorationRatio(
    profile.movies.strength,
  );
  const tvExplorationRatio = calculateExplorationRatio(profile.tv.strength);

  const [movieCandidates, tvCandidates] = await Promise.all([
    generateCandidates(
      profile.movies.connections,
      enrichedHistory,
      "movie",
      RECOMMENDATION_LIMIT,
    ),
    generateCandidates(
      profile.tv.connections,
      enrichedHistory,
      "tv",
      RECOMMENDATION_LIMIT,
    ),
  ]);

  const [scoredMovies, scoredTv] = [
    applyTemporalScoring(
      scoreCandidates(movieCandidates, enrichedHistory, feedback),
      profile.movies,
    ),
    applyTemporalScoring(
      scoreCandidates(tvCandidates, enrichedHistory, feedback),
      profile.tv,
    ),
  ];

  const groundedMovies = enforceRecommendationGrounding(scoredMovies);
  const groundedTv = enforceRecommendationGrounding(scoredTv);

  const rankRecommendationPools = (candidates) => {
    const exploitation = candidates.filter(
      (candidate) => candidate.pool === "exploitation",
    );
    const exploration = candidates.filter(
      (candidate) => candidate.pool === "exploration",
    );

    return {
      exploitation: diversifyRankedCandidates(
        exploitation,
        exploitation.length || 1,
        DIVERSITY_LAMBDA,
      ),
      exploration: diversifyRankedCandidates(
        exploration,
        exploration.length || 1,
        DIVERSITY_LAMBDA,
      ),
      counts: {
        total: candidates.length,
        exploitation: exploitation.length,
        exploration: exploration.length,
      },
    };
  };

  const moviePools = rankRecommendationPools(groundedMovies);
  const tvPools = rankRecommendationPools(groundedTv);

  const diversifiedMovies = mixRecommendationPools(
    moviePools.exploitation,
    moviePools.exploration,
    RECOMMENDATION_LIMIT,
    movieExplorationRatio,
  );

  const diversifiedTv = mixRecommendationPools(
    tvPools.exploitation,
    tvPools.exploration,
    RECOMMENDATION_LIMIT,
    tvExplorationRatio,
  );

  const knownIds = new Set(
    canonicalHistory
      .filter((item) => ["watched", "to_watch", "not_sure"].includes(item.status))
      .map((item) => createMediaKey(item.type, item.id)),
  );

  const safeMovies = removeKnownRecommendations(diversifiedMovies, knownIds);
  const safeTv = removeKnownRecommendations(diversifiedTv, knownIds);

  validateRecommendationOutput(safeMovies, {
    mediaType: "movie",
    limit: RECOMMENDATION_LIMIT,
    knownIds,
    explorationRatio: movieExplorationRatio,
  });

  validateRecommendationOutput(safeTv, {
    mediaType: "tv",
    limit: RECOMMENDATION_LIMIT,
    knownIds,
    explorationRatio: tvExplorationRatio,
  });

  const generationId = new Date().toISOString();

  const attachGenerationId = (recommendations) =>
    recommendations.map((recommendation) => ({
      ...recommendation,
      generationId,
    }));

  return {
    profile,
    tasteProfile,
    explorationPolicy: {
      movies: {
        ratio: movieExplorationRatio,
        strength: profile.movies.strength,
      },
      tv: {
        ratio: tvExplorationRatio,
        strength: profile.tv.strength,
      },
    },
    recommendationDiagnostics: {
      movies: {
        historyItems: canonicalHistory.filter((item) => item.type === "movie").length,
        ratedItems: enrichedHistory.filter(
          (item) => item.type === "movie" && item.status === "watched" && item.rating,
        ).length,
        candidateCounts: moviePools.counts,
        finalExploitation: safeMovies.filter(
          (item) => item.pool === "exploitation",
        ).length,
        finalExploration: safeMovies.filter(
          (item) => item.pool === "exploration",
        ).length,
      },
      tv: {
        historyItems: canonicalHistory.filter((item) => item.type === "tv").length,
        ratedItems: enrichedHistory.filter(
          (item) => item.type === "tv" && item.status === "watched" && item.rating,
        ).length,
        candidateCounts: tvPools.counts,
        finalExploitation: safeTv.filter(
          (item) => item.pool === "exploitation",
        ).length,
        finalExploration: safeTv.filter(
          (item) => item.pool === "exploration",
        ).length,
      },
    },
    recommendations: {
      movies: attachGenerationId(safeMovies),
      tv: attachGenerationId(safeTv),
    },
  };
}
