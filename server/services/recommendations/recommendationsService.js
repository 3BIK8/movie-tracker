import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { analyzeHistory } from "./historyAnalyzer.js";
import { generateCandidates } from "./candidateService.js";
import { scoreCandidates } from "./recommendationScorer.js";
import { diversifyRankedCandidates } from "./recommendationDiversifier.js";
import { normalizeWatchHistory } from "../../utils/mediaIdentity.js";
import { mapWithConcurrency } from "../../utils/runWithConcurrency.js";

const RECOMMENDATION_LIMIT = 100;
const HISTORY_ENRICHMENT_CONCURRENCY = 6;
const DIVERSITY_LAMBDA = 0.8;

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

  const diversifiedMovies = diversifyRankedCandidates(
    scoredMovies,
    RECOMMENDATION_LIMIT,
    DIVERSITY_LAMBDA,
  );

  const diversifiedTv = diversifyRankedCandidates(
    scoredTv,
    RECOMMENDATION_LIMIT,
    DIVERSITY_LAMBDA,
  );

  return {
    profile,
    recommendations: {
      movies: diversifiedMovies,
      tv: diversifiedTv,
    },
  };
}
