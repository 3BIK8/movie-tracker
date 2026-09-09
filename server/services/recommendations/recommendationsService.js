import { getMediaMetadata } from "./mediaMetadataService.js";
import { analyzeHistory } from "./historyAnalyzer.js";
import { generateCandidates } from "./candidateService.js";
import { scoreCandidates } from "./recommendationScorer.js";

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

        // Preserve the user's personal rating.
        rating: historyItem.rating,

        // Preserve TMDB's rating separately.
        tmdbRating: metadata.rating,
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
   * Generate movie candidates from the
   * movie-specific taste profile.
   */
  const movieCandidates = await generateCandidates(
    profile.movies.connections,
    enrichedHistory,
    "movie",
  );

  /*
   * Generate TV candidates from the
   * TV-specific taste profile.
   */
  const tvCandidates = await generateCandidates(
    profile.tv.connections,
    enrichedHistory,
    "tv",
  );

  /*
   * Score each media type independently.
   *
   * This is important because movie and TV
   * discovery behavior are different.
   */
  const scoredMovies = scoreCandidates(
    movieCandidates,
    enrichedHistory,
    "movie",
  );

  const scoredTv = scoreCandidates(tvCandidates, enrichedHistory, "tv");

  return {
    profile,

    recommendations: {
      movies: scoredMovies,
      tv: scoredTv,
    },
  };
}
