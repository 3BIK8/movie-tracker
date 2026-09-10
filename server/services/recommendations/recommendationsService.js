import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { analyzeHistory } from "./historyAnalyzer.js";
import { generateCandidates } from "./candidateService.js";
import { scoreCandidates } from "./recommendationScorer.js";

const RECOMMENDATION_LIMIT = 100;

export async function analyzeWatchHistory(history) {
  if (!Array.isArray(history)) {
    throw new TypeError("Watch history must be an array.");
  }

  const enrichedHistory = [];

  for (const historyItem of history) {
    if (!historyItem?.id || !historyItem?.type) {
      continue;
    }

    try {
      const metadata = await getMediaMetadata(historyItem.type, historyItem.id);

      if (!metadata) {
        continue;
      }

      enrichedHistory.push({
        ...historyItem,
        ...metadata,

        rating: historyItem.rating,

        tmdbRating: metadata.rating,

        connections: getMediaConnections(metadata),
      });
    } catch (error) {
      console.warn(
        `Failed to enrich history item ${historyItem.type}:${historyItem.id}`,
        error.message,
      );
    }
  }

  const profile = analyzeHistory(enrichedHistory);

  /*
   * Movies use the movie taste profile.
   */
  const movieCandidates = await generateCandidates(
    profile.movies.connections,
    enrichedHistory,
    "movie",
    RECOMMENDATION_LIMIT,
  );

  /*
   * TV uses the TV taste profile.
   */
  const tvCandidates = await generateCandidates(
    profile.tv.connections,
    enrichedHistory,
    "tv",
    RECOMMENDATION_LIMIT,
  );

  /*
   * Score movies independently.
   */
  const scoredMovies = scoreCandidates(movieCandidates, enrichedHistory);

  const scoredTv = scoreCandidates(tvCandidates, enrichedHistory);

  return {
    profile,

    recommendations: {
      movies: scoredMovies,
      tv: scoredTv,
    },
  };
}
