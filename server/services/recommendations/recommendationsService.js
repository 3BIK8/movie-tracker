import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { analyzeHistory } from "./historyAnalyzer.js";
import { generateCandidates } from "./candidateService.js";
import { scoreCandidates } from "./recommendationScorer.js";
import { mapWithConcurrency } from "../../utils/runWithConcurrency.js";

const RECOMMENDATION_LIMIT = 100;
const HISTORY_ENRICHMENT_CONCURRENCY = 6;

export async function analyzeWatchHistory(history) {
  if (!Array.isArray(history)) {
    throw new TypeError("Watch history must be an array.");
  }

  const enrichedResults = await mapWithConcurrency(
    history,
    async (historyItem) => {
      if (!historyItem?.id || !historyItem?.type) {
        return null;
      }

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

  return {
    profile,
    recommendations: {
      movies: scoredMovies,
      tv: scoredTv,
    },
  };
}
