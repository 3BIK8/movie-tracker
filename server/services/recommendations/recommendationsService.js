import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { analyzeHistory } from "./historyAnalyzer.js";
import { generateCandidates } from "./candidateService.js";
import { scoreCandidates } from "./recommendationScorer.js";
import { diversifyRankedCandidates } from "./recommendationDiversifier.js";
import { mixRecommendationPools } from "./recommendationMixer.js";
import { validateRecommendationOutput } from "./recommendationInvariants.js";
import { createMediaKey, normalizeWatchHistory } from "../../utils/mediaIdentity.js";
import { mapWithConcurrency } from "../../utils/runWithConcurrency.js";

const RECOMMENDATION_LIMIT = 100;
const HISTORY_ENRICHMENT_CONCURRENCY = 6;
const DIVERSITY_LAMBDA = 0.8;
const EXPLORATION_RATIO = 0.2;

export async function analyzeWatchHistory(history) {
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
  const profile = analyzeHistory(enrichedHistory);

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
    scoreCandidates(movieCandidates, enrichedHistory),
    scoreCandidates(tvCandidates, enrichedHistory),
  ];

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
    };
  };

  const moviePools = rankRecommendationPools(scoredMovies);
  const tvPools = rankRecommendationPools(scoredTv);

  const diversifiedMovies = mixRecommendationPools(
    moviePools.exploitation,
    moviePools.exploration,
    RECOMMENDATION_LIMIT,
    EXPLORATION_RATIO,
  );

  const diversifiedTv = mixRecommendationPools(
    tvPools.exploitation,
    tvPools.exploration,
    RECOMMENDATION_LIMIT,
    EXPLORATION_RATIO,
  );

  const knownIds = new Set(
    canonicalHistory
      .filter((item) => ["watched", "to_watch", "not_sure"].includes(item.status))
      .map((item) => createMediaKey(item.type, item.id)),
  );

  validateRecommendationOutput(diversifiedMovies, {
    mediaType: "movie",
    limit: RECOMMENDATION_LIMIT,
    knownIds,
  });

  validateRecommendationOutput(diversifiedTv, {
    mediaType: "tv",
    limit: RECOMMENDATION_LIMIT,
    knownIds,
  });

  return {
    profile,
    recommendations: {
      movies: diversifiedMovies,
      tv: diversifiedTv,
    },
  };
}
